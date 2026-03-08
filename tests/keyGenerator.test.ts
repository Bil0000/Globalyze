import { afterEach, describe, expect, it, mock } from "bun:test";
import { generateSemanticKeys } from "../src/ai/keyGenerator";
import type { ExtractedString } from "../src/types";

describe("generateSemanticKeys", () => {
  const originalFetch = globalThis.fetch;
  const originalOpenAiKeys = process.env.OPENAI_API_KEYS;
  const originalOpenAiKey2 = process.env.OPENAI_API_KEY_2;
  const originalGeminiKeys = process.env.GEMINI_API_KEYS;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEYS;
    delete process.env.OPENAI_API_KEY_2;
    delete process.env.GEMINI_API_KEYS;

    if (originalOpenAiKeys !== undefined) {
      process.env.OPENAI_API_KEYS = originalOpenAiKeys;
    }
    if (originalOpenAiKey2 !== undefined) {
      process.env.OPENAI_API_KEY_2 = originalOpenAiKey2;
    }
    if (originalGeminiKeys !== undefined) {
      process.env.GEMINI_API_KEYS = originalGeminiKeys;
    }
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
    expect(result.fallbackReason).toContain("No Gemini keys are configured");
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
    expect(result.fallbackReason).toContain("OpenAI rate limit reached");
    expect(result.fallbackReason).toContain("Gemini fallback also failed");
    expect(result.keysByText.get("Checkout")).toBe("checkout.checkout");
  });

  it("rotates through multiple OpenAI keys until one succeeds", async () => {
    const strings: ExtractedString[] = [
      {
        text: "Checkout",
        file: "/tmp/demo/src/app/checkout/page.tsx",
        line: 3,
        column: 5,
        kind: "jsx-text"
      }
    ];
    process.env.OPENAI_API_KEYS = "openai-1";
    process.env.OPENAI_API_KEY_2 = "openai-2";
    const attempts: string[] = [];

    const result = await generateSemanticKeys(strings, {
      apiKeys: ["openai-1", "openai-2"],
      openAIClientFactory: (apiKey) => ({
        responses: {
          create: mock(() => {
            attempts.push(apiKey);

            if (apiKey === "openai-1") {
              const error = new Error("rate limited");
              (error as Error & { status?: number }).status = 429;
              return Promise.reject(error);
            }

            return Promise.resolve({
              output_text:
                '{"items":[{"text":"Checkout","key":"checkout.button"}]}'
            });
          }) as unknown as (input: {
            model: string;
            input: string;
          }) => Promise<{ output_text: string }>
        }
      })
    });

    expect(attempts).toEqual(["openai-1", "openai-2"]);
    expect(result.keysByText.get("Checkout")).toBe("checkout.button");
  });

  it("rotates through multiple Gemini keys after OpenAI keys are exhausted", async () => {
    const strings: ExtractedString[] = [
      {
        text: "Checkout",
        file: "/tmp/demo/src/app/checkout/page.tsx",
        line: 3,
        column: 5,
        kind: "jsx-text"
      }
    ];

    process.env.GEMINI_API_KEYS = "gemini-1,gemini-2";
    const geminiAttempts: string[] = [];

    const fetchImpl = mock((input: string | URL, init?: RequestInit) => {
      void input;
      const headers = (init?.headers ?? {}) as Record<string, unknown>;
      const apiKey =
        typeof headers["x-goog-api-key"] === "string"
          ? headers["x-goog-api-key"]
          : "";
      geminiAttempts.push(apiKey);

      if (apiKey === "gemini-1") {
        return Promise.resolve(new Response("rate limited", { status: 429 }));
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text:
                        '{"items":[{"text":"Checkout","key":"checkout.button"}]}'
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
    });

    const result = await generateSemanticKeys(strings, {
      apiKey: "openai-test-key",
      openAIClient: createRateLimitedOpenAIClient("rate limit"),
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(geminiAttempts).toEqual(["gemini-1", "gemini-2"]);
    expect(result.keysByText.get("Checkout")).toBe("checkout.button");
  });
});
