import { describe, expect, it } from "bun:test";

import { generateSemanticKeys } from "../src/ai/keyGenerator";
import type { ExtractedString } from "../src/types";

describe("generateSemanticKeys", () => {
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
    expect(result.keysByText.get("Buy now")).toBe("checkout.buy_now");
    expect(result.keysByText.get("Welcome to our store")).toBe(
      "hero.welcome_to_our_store"
    );
  });
});
