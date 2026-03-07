import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  buildSourceLocale,
  ensureLocaleCoverageReady,
  findMissingTranslationKeys,
  readLocaleDictionary,
  syncLocaleFiles,
  writeLocaleDictionary
} from "../src/i18n/localeManager";
import { createTestConfig } from "./testUtils";
import { GlobalyzeError } from "../src/utils/errors";

describe("localeManager", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
  });

  it("creates locale files and reports missing translations", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locales-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir);
    const sourceLocale = buildSourceLocale([
      {
        key: "checkout.buy_button",
        text: "Buy now",
        file: "src/app/page.tsx"
      }
    ]);

    await syncLocaleFiles(config, sourceLocale);

    expect(await readLocaleDictionary(config, "en")).toEqual({
      "checkout.buy_button": "Buy now"
    });

    const missingBefore = await findMissingTranslationKeys(config);
    expect(missingBefore.fr).toEqual(["checkout.buy_button"]);

    await writeLocaleDictionary(config, "fr", {
      "checkout.buy_button": "Acheter maintenant"
    });

    const missingAfter = await findMissingTranslationKeys(config);
    expect(missingAfter.fr).toEqual([]);
  });

  it("fails coverage checks with a clear error when locales do not exist", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locales-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir);

    expect(ensureLocaleCoverageReady(config)).rejects.toThrow(
      new GlobalyzeError(
        `Locales directory does not exist: ${config.localesDir}. Run "globalyze transform" or "globalyze run" first.`
      )
    );
  });
});
