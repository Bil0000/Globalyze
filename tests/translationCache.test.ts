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

  it("does not cache or reuse copied English fallback values", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-cache-"));
    tempDirectories.push(rootDir);

    const writes = await storeCachedTranslations(
      { "dashboard.welcome_back": "Welcome back" },
      "fr",
      { "dashboard.welcome_back": "Welcome back" },
      rootDir
    );

    const cache = await readTranslationCache(rootDir);
    const cached = await getCachedTranslations(
      { "dashboard.welcome_back": "Welcome back" },
      "fr",
      rootDir
    );

    expect(writes).toBe(0);
    expect(cache).toEqual({});
    expect(cached).toEqual({
      translations: {},
      hits: 0
    });
  });
});
