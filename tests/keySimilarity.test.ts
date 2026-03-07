import { describe, expect, it } from "bun:test";

import {
  calculateSimilarityScore,
  findSimilarExistingKey
} from "../src/ai/keySimilarity";

describe("keySimilarity", () => {
  it("returns a high score for minor copy changes", () => {
    expect(calculateSimilarityScore("Start trial", "Start free trial")).toBeGreaterThan(
      0.8
    );
  });

  it("reuses the closest existing key above the threshold", () => {
    const match = findSimilarExistingKey(
      "Start free trial",
      {
        "pricing.start_trial": "Start trial",
        "checkout.buy_button": "Buy now"
      },
      new Set<string>()
    );

    expect(match?.key).toBe("pricing.start_trial");
  });
});
