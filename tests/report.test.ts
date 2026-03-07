import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  generateTranslationCoverageReport
} from "../src/report/coverageReport";
import { writeLocaleDictionary } from "../src/i18n/localeManager";
import { createTestConfig } from "./testUtils";

describe("generateTranslationCoverageReport", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
  });

  it("calculates coverage and missing keys", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-report-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "fr", "de"]
    });

    await writeLocaleDictionary(config, "en", {
      "checkout.buy_button": "Buy now",
      "home.hero_title": "Welcome"
    });
    await writeLocaleDictionary(config, "fr", {
      "checkout.buy_button": "Acheter"
    });
    await writeLocaleDictionary(config, "de", {
      "checkout.buy_button": "Jetzt kaufen",
      "home.hero_title": "Willkommen"
    });

    const report = await generateTranslationCoverageReport(config);
    const french = report.languages.find((language) => language.code === "fr");
    const german = report.languages.find((language) => language.code === "de");

    expect(report.totalKeys).toBe(2);
    expect(french).toBeDefined();
    expect(french?.coverage).toBe(50);
    expect(french?.missingKeys).toEqual(["home.hero_title"]);
    expect(german?.coverage).toBe(100);
    expect(german?.missingKeys).toEqual([]);
  });

  it("treats empty locale values as missing", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-report-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "ar"]
    });

    await writeLocaleDictionary(config, "en", {
      "pricing.plan_title": "Starter"
    });
    await writeLocaleDictionary(config, "ar", {
      "pricing.plan_title": ""
    });

    const report = await generateTranslationCoverageReport(config);
    const arabic = report.languages.find((language) => language.code === "ar");

    expect(arabic?.coverage).toBe(0);
    expect(arabic?.missingKeys).toEqual(["pricing.plan_title"]);
  });

  it("reports perfect coverage for fully translated locales", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-report-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "ar", "fr"]
    });

    await writeLocaleDictionary(config, "en", {
      "checkout.buy_button": "Buy now"
    });
    await writeLocaleDictionary(config, "ar", {
      "checkout.buy_button": "اشتر الآن"
    });
    await writeLocaleDictionary(config, "fr", {
      "checkout.buy_button": "Acheter maintenant"
    });

    const report = await generateTranslationCoverageReport(config);

    expect(report.languages.map((language) => language.coverage)).toEqual([
      100,
      100,
      100
    ]);
  });
});
