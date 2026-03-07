import { afterEach, describe, expect, it, mock } from "bun:test";
import { generateSemanticKeys } from "../src/ai/keyGenerator";
import type { ExtractedString } from "../src/types";

describe("generateSemanticKeys", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
  });

  function createRateLimitedOpenAIClient(
    message: string
  ): {
    responses: {
      create: (input: {
        model: string;
        input: string;
      }) => Promise<{ output_text: string }>;
    };
  } {
    return {
      responses: {
        create: mock(() => {
          const error = new Error(message);
          (error as Error & { status?: number }).status = 429;
          return Promise.reject(error);
        }) as unknown as (input: {
          model: string;
          input: string;
        }) => Promise<{ output_text: string }>
      }
    };
  }

  it("falls back to deterministic slug-based keys when no API key is available", async () => {
    const strings: ExtractedString[] = [
      {
        text: "Buy now",
        file: "/tmp/demo/src/app/checkout/page.tsx",
        line: 3,
        column: 5,
        kind: "jsx-text"
      },
      {
        text: "Welcome to our store",
        file: "/tmp/demo/src/components/Hero.tsx",
        line: 4,
        column: 5,
        kind: "jsx-text"
      }
    ];

    const result = await generateSemanticKeys(strings, {
      apiKey: undefined
    });

    expect(result.usedFallback).toBe(true);
    expect(result.reusedExistingKeys).toBe(0);
    expect(result.keysByText.get("Buy now")).toBe("checkout.buy_now");
    expect(result.keysByText.get("Welcome to our store")).toBe(
      "hero.welcome_to_our_store"
    );
  });

  it("reuses an existing key for a similar source string", async () => {
    const strings: ExtractedString[] = [
      {
        text: "Start free trial",
        file: "/tmp/demo/src/components/Pricing.tsx",
        line: 7,
        column: 3,
        kind: "jsx-text"
      }
    ];

    const result = await generateSemanticKeys(strings, {
      apiKey: undefined,
      existingLocale: {
        "pricing.start_trial": "Start trial"
      }
    });

    expect(result.keysByText.get("Start free trial")).toBe("pricing.start_trial");
    expect(result.reusedExistingKeys).toBe(1);
  });

  it("falls back to Gemini when OpenAI is rate limited", async () => {
    const strings: ExtractedString[] = [
      {
        text: "Checkout",
        file: "/tmp/demo/src/app/checkout/page.tsx",
        line: 3,
        column: 5,
        kind: "jsx-text"
      }
    ];

    process.env.GEMINI_API_KEY = "gemini-test-key";
    const fetchImpl = mock(() =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"items":[{"text":"Checkout","key":"checkout.button"}]}'
                  }
                ]
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );

    const result = await generateSemanticKeys(strings, {
      apiKey: "openai-test-key",
      openAIClient: createRateLimitedOpenAIClient("rate limit"),
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result.usedFallback).toBe(false);
    expect(result.keysByText.get("Checkout")).toBe("checkout.button");
  });

  it("accepts Gemini JSON wrapped in markdown fences", async () => {
    const strings: ExtractedString[] = [
      {
        text: "Checkout",
        file: "/tmp/demo/src/app/checkout/page.tsx",
        line: 3,
        column: 5,
        kind: "jsx-text"
      }
    ];

    process.env.GEMINI_API_KEY = "gemini-test-key";
    const fetchImpl = mock(() =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: [
                      "```json",
                      '{"items":[{"text":"Checkout","key":"checkout.button"}]}',
                      "```"
                    ].join("\n")
                  }
                ]
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );

    const result = await generateSemanticKeys(strings, {
      apiKey: "openai-test-key",
      openAIClient: createRateLimitedOpenAIClient("rate limit"),
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result.usedFallback).toBe(false);
    expect(result.keysByText.get("Checkout")).toBe("checkout.button");
  });

  it("uses deterministic keys when OpenAI is rate limited and Gemini is unavailable", async () => {
    const strings: ExtractedString[] = [
      {
        text: "Checkout",
        file: "/tmp/demo/src/app/checkout/page.tsx",
        line: 3,
        column: 5,
        kind: "jsx-text"
      }
    ];

    const result = await generateSemanticKeys(strings, {
      apiKey: "openai-test-key",
      openAIClient: createRateLimitedOpenAIClient("rate limit")
    });

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toContain("GEMINI_API_KEY is not set");
    expect(result.keysByText.get("Checkout")).toBe("checkout.checkout");
  });

  it("warns when both OpenAI and Gemini are rate limited", async () => {
    const strings: ExtractedString[] = [
      {
        text: "Checkout",
        file: "/tmp/demo/src/app/checkout/page.tsx",
        line: 3,
        column: 5,
        kind: "jsx-text"
      }
    ];

    process.env.GEMINI_API_KEY = "gemini-test-key";
    const fetchImpl = mock(() =>
      new Response("gemini rate limit", {
        status: 429
      })
    );

    const result = await generateSemanticKeys(strings, {
      apiKey: "openai-test-key",
      openAIClient: createRateLimitedOpenAIClient("openai rate limit"),
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toContain("OpenAI key generation hit a rate limit");
    expect(result.fallbackReason).toContain("Gemini fallback also failed");
    expect(result.keysByText.get("Checkout")).toBe("checkout.checkout");
  });
});
