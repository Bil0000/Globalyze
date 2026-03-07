import path from "node:path";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const localizeObjectMock = mock(
  async (sourceLocale: Record<string, string>, options: { targetLocale: string }) => {
    await Promise.resolve();

    return Object.fromEntries(
      Object.entries(sourceLocale).map(([key, value]) => [
        key,
        `${options.targetLocale}:${value}`
      ])
    );
  }
);

void mock.module("lingo.dev/sdk", () => ({
  LingoDotDevEngine: class {
    async localizeObject(
      sourceLocale: Record<string, string>,
      options: { targetLocale: string }
    ) {
      return localizeObjectMock(sourceLocale, options);
    }
  }
}));

import {
  readLocaleDictionary,
  writeLocaleDictionary
} from "../src/i18n/localeManager";
import { processWatchUpdate } from "../src/watch/watchMode";
import type { ExtractedString } from "../src/types";
import { createTestConfig } from "./testUtils";

describe("processWatchUpdate", () => {
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

  it("translates new locale keys for target languages during watch updates", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-watch-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "fr"]
    });
    const sourceFile = path.join(config.sourceDir, "components", "Pricing.tsx");
    await mkdir(path.dirname(sourceFile), { recursive: true });

    await writeFile(
      sourceFile,
      [
        'export function Pricing() {',
        '  return <button>Contact Support</button>;',
        '}',
        ""
      ].join("\n"),
      "utf8"
    );

    process.env.LINGO_API_KEY = "test-key";

    const result = await processWatchUpdate(config, [] satisfies ExtractedString[]);
    const englishLocale = await readLocaleDictionary(config, "en");
    const frenchLocale = await readLocaleDictionary(config, "fr");

    expect(result.newStrings).toHaveLength(1);
    expect(result.translation?.translatedLocales).toEqual(["fr"]);
    expect(englishLocale).toEqual({
      "pricing.contact_support": "Contact Support"
    });
    expect(frenchLocale).toEqual({
      "pricing.contact_support": "fr:Contact Support"
    });
  });

  it("removes deleted translation keys from all locale files during watch updates", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-watch-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "fr"]
    });
    const sourceFile = path.join(config.sourceDir, "components", "Pricing.tsx");
    await mkdir(path.dirname(sourceFile), { recursive: true });

    await writeFile(
      sourceFile,
      [
        'import { t } from "@/i18n";',
        'export function Pricing() {',
        '  return <button>{t("pricing.contact_support")}</button>;',
        '}',
        ""
      ].join("\n"),
      "utf8"
    );

    await writeLocaleDictionary(config, "en", {
      "pricing.contact_support": "Contact Support"
    });
    await writeLocaleDictionary(config, "fr", {
      "pricing.contact_support": "fr:Contact Support"
    });

    const previousStrings = [] satisfies ExtractedString[];
    const result = await processWatchUpdate(config, previousStrings);
    const englishLocale = await readLocaleDictionary(config, "en");
    const frenchLocale = await readLocaleDictionary(config, "fr");

    expect(result.newStrings).toEqual([]);
    expect(result.localeSync.sourceKeyCount).toBe(1);
    expect(englishLocale).toEqual({
      "pricing.contact_support": "Contact Support"
    });
    expect(frenchLocale).toEqual({
      "pricing.contact_support": "fr:Contact Support"
    });

    await writeFile(
      sourceFile,
      [
        'export function Pricing() {',
        '  return <div />;',
        '}',
        ""
      ].join("\n"),
      "utf8"
    );

    const deletedResult = await processWatchUpdate(config, previousStrings);
    const englishAfterDelete = await readLocaleDictionary(config, "en");
    const frenchAfterDelete = await readLocaleDictionary(config, "fr");

    expect(deletedResult.localeSync.sourceKeyCount).toBe(0);
    expect(englishAfterDelete).toEqual({});
    expect(frenchAfterDelete).toEqual({});
  });
});
