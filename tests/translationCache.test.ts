import { afterEach, describe, expect, it } from "bun:test";
import fs from "fs-extra";
import path from "node:path";

import {
  getCachedTranslations,
  readTranslationCache,
  storeCachedTranslations
} from "../src/cache/translationCache";
import { resolveGlobalyzeRootDir } from "../src/utils/fileUtils";

describe("translationCache", () => {
  const cachePath = path.join(
    resolveGlobalyzeRootDir(),
    ".globalyze",
    "translations.json"
  );

  afterEach(async () => {
    await fs.remove(cachePath);
  });

  it("stores and reuses cached translations", async () => {
    await storeCachedTranslations(
      { "checkout.button": "Checkout" },
      "fr",
      { "checkout.button": "Paiement" }
    );

    const cache = await readTranslationCache();
    expect(cache.Checkout?.fr).toBe("Paiement");

    const cached = await getCachedTranslations(
      { "checkout.button": "Checkout" },
      "fr"
    );
    expect(cached.hits).toBe(1);
    expect(cached.translations["checkout.button"]).toBe("Paiement");
  });
});
