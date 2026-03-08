import { afterEach, describe, expect, it } from "bun:test";
import path from "node:path";

import {
  getCachedTranslations,
  readTranslationCache,
  storeCachedTranslations
} from "../src/cache/translationCache";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("translationCache", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
  });

  it("stores and reuses cached translations", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-cache-"));
    tempDirectories.push(rootDir);

    await storeCachedTranslations(
      { "checkout.button": "Checkout" },
      "fr",
      { "checkout.button": "Paiement" },
      rootDir
    );

    const cache = await readTranslationCache(rootDir);
    expect(cache.Checkout?.fr).toBe("Paiement");

    const cached = await getCachedTranslations(
      { "checkout.button": "Checkout" },
      "fr",
      rootDir
    );
    expect(cached.hits).toBe(1);
    expect(cached.translations["checkout.button"]).toBe("Paiement");
  });
});
