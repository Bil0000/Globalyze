import path from "node:path";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { syncLocaleFiles, readLocaleDictionary } from "../src/i18n/localeManager";
import { translateLocales } from "../src/lingo/lingoClient";
import { createTestConfig } from "./testUtils";

const localizeObjectMock = mock(async () => {
  await Promise.resolve();
  throw new Error("network unavailable");
});

void mock.module("lingo.dev/sdk", () => ({
  LingoDotDevEngine: class {
    async localizeObject() {
      return localizeObjectMock();
    }
  }
}));

describe("translateLocales", () => {
  const tempDirectories: string[] = [];
  const originalApiKey = process.env.LINGO_API_KEY;

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;

    if (originalApiKey === undefined) {
      delete process.env.LINGO_API_KEY;
    } else {
      process.env.LINGO_API_KEY = originalApiKey;
    }

    localizeObjectMock.mockClear();
  });

  it("falls back to English values when the translation API fails", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-lingo-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "fr"]
    });

    await syncLocaleFiles(config, {
      "checkout.buy_button": "Buy now"
    });
    process.env.LINGO_API_KEY = "test-key";

    const result = await translateLocales(config);
    const locale = await readLocaleDictionary(config, "fr");

    expect(result.usedMockTranslations).toBe(true);
    expect(result.skippedReason).toContain("Lingo.dev translation failed for fr");
    expect(locale).toEqual({
      "checkout.buy_button": "Buy now"
    });
  });
});
