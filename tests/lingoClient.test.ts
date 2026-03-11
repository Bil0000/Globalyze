import path from "node:path";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import fs from "fs-extra";

import { syncLocaleFiles, readLocaleDictionary } from "../src/i18n/localeManager";
import { extractTranslationKeyReferencesFromFiles } from "../src/extractor/translationKeyExtractor";
import { translateLocales } from "../src/lingo/lingoClient";
import { createTestConfig } from "./testUtils";

const localizeObjectMock = mock(
  (
    sourceLocale: Record<string, string>,
    params: Record<string, unknown>
  ): Promise<Record<string, string>> => {
    void sourceLocale;
    void params;
    return Promise.reject(new Error("network unavailable"));
  }
);
const localizeObjectCalls: {
  sourceLocale: Record<string, string>;
  params: Record<string, unknown>;
}[] = [];

void mock.module("lingo.dev/sdk", () => ({
  LingoDotDevEngine: class {
    async localizeObject(
      sourceLocale: Record<string, string>,
      params: Record<string, unknown>
    ) {
      localizeObjectCalls.push({ sourceLocale, params });
      return localizeObjectMock(sourceLocale, params);
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
    localizeObjectCalls.length = 0;
  });

  it("falls back to English values when the translation API fails", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-lingo-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "fr"],
      localeStructure: {
        format: "json",
        structure: "single",
        splitStrategy: "page",
        commonFile: false,
        naming: "dot",
        unresolvedOwnership: "common"
      }
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

  it("passes translation instructions as Lingo hints", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-lingo-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "fr"],
      translationInstructions: [
        "This is a commerce app.",
        "Use natural checkout terminology."
      ]
    });

    await syncLocaleFiles(config, {
      "checkout.buy_button": "Buy now"
    });
    process.env.LINGO_API_KEY = "test-key";

    await translateLocales(config);

    expect(localizeObjectCalls).toHaveLength(1);
    expect(localizeObjectCalls[0]?.params).toMatchObject({
      sourceLocale: "en",
      targetLocale: "fr",
      hints: {
        "checkout.buy_button": [
          "This is a commerce app.",
          "Use natural checkout terminology."
        ]
      }
    });
  });

  it("preserves component-based file structure for translated locales", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-lingo-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "fr"],
      localeStructure: {
        format: "js",
        structure: "multiple",
        splitStrategy: "component",
        commonFile: false,
        naming: "dot",
        unresolvedOwnership: "common"
      }
    });

    await fs.ensureDir(path.join(config.sourceDir, "app"));
    await fs.ensureDir(path.join(config.sourceDir, "components"));
    await fs.writeFile(
      path.join(config.sourceDir, "app", "page.tsx"),
      [
        'import { MarketingHero } from "@/components/MarketingHero";',
        'import { PricingSection } from "@/components/PricingSection";',
        "",
        "export default function HomePage() {",
        "  return (",
        "    <main>",
        '      <h1>{t("home.title")}</h1>',
        "      <MarketingHero />",
        "      <PricingSection />",
        "    </main>",
        "  );",
        "}"
      ].join("\n"),
      "utf8"
    );
    await fs.writeFile(
      path.join(config.sourceDir, "components", "MarketingHero.tsx"),
      [
        "export function MarketingHero() {",
        '  return <section>{t("home.marketing_hero.book_demo")}</section>;',
        "}"
      ].join("\n"),
      "utf8"
    );
    await fs.writeFile(
      path.join(config.sourceDir, "components", "PricingSection.tsx"),
      [
        "export function PricingSection() {",
        '  return <section>{t("home.pricing.contact_sales")}</section>;',
        "}"
      ].join("\n"),
      "utf8"
    );

    const sourceAssignments = await extractTranslationKeyReferencesFromFiles(
      [
        path.join(config.sourceDir, "app", "page.tsx"),
        path.join(config.sourceDir, "components", "MarketingHero.tsx"),
        path.join(config.sourceDir, "components", "PricingSection.tsx")
      ],
      config.translationFunctionName
    );

    await syncLocaleFiles(
      config,
      {
        "home.title": "Global releases without the spreadsheet tax",
        "home.marketing_hero.book_demo": "Book demo",
        "home.pricing.contact_sales": "Contact sales"
      },
      {
        sourceAssignments
      }
    );
    process.env.LINGO_API_KEY = "test-key";
    localizeObjectMock.mockImplementation(
      (
        pendingSourceLocale: Record<string, string>
      ): Promise<Record<string, string>> =>
        Promise.resolve(
          Object.fromEntries(
            Object.entries(pendingSourceLocale).map(([key, value]) => [
              key,
              `fr:${value}`
            ])
          )
        )
    );

    await translateLocales(config);

    const targetFiles = (await fs.readdir(path.join(config.localesDir, "fr"))).sort();

    expect(targetFiles).toEqual([
      "marketinghero.component.js",
      "page.component.js",
      "pricingsection.component.js"
    ]);

    const pageFile = await fs.readFile(
      path.join(config.localesDir, "fr", "page.component.js"),
      "utf8"
    );
    const marketingFile = await fs.readFile(
      path.join(config.localesDir, "fr", "marketinghero.component.js"),
      "utf8"
    );
    const pricingFile = await fs.readFile(
      path.join(config.localesDir, "fr", "pricingsection.component.js"),
      "utf8"
    );

    expect(pageFile).toContain('"home.title": "fr:Global releases without the spreadsheet tax"');
    expect(marketingFile).toContain('"home.marketing_hero.book_demo": "fr:Book demo"');
    expect(pricingFile).toContain('"home.pricing.contact_sales": "fr:Contact sales"');
  });

  it("reuses existing translated locale values without calling the translation API again", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-lingo-cache-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "fr"],
      localeStructure: {
        format: "json",
        structure: "single",
        splitStrategy: "page",
        commonFile: false,
        naming: "dot",
        unresolvedOwnership: "common"
      }
    });

    await syncLocaleFiles(config, {
      "checkout.buy_button": "Buy now",
      "checkout.cancel_button": "Cancel"
    });
    await fs.writeJson(
      path.join(config.localesDir, "fr", "fr.json"),
      {
        "checkout.buy_button": "Acheter",
        "checkout.cancel_button": "Annuler"
      },
      { spaces: 2 }
    );
    process.env.LINGO_API_KEY = "test-key";
    localizeObjectMock.mockImplementation(
      (): Promise<Record<string, string>> =>
        Promise.reject(new Error("translation API should not be called"))
    );
    const result = await translateLocales(config);
    const locale = await readLocaleDictionary(config, "fr");

    expect(result.usedMockTranslations).toBe(false);
    expect(result.skippedReason).toBeUndefined();
    expect(locale).toEqual({
      "checkout.buy_button": "Acheter",
      "checkout.cancel_button": "Annuler"
    });
  });
});
