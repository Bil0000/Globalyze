import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  buildSourceLocale,
  ensureLocaleCoverageReady,
  findMissingTranslationKeys,
  mergeSourceLocaleDictionary,
  reconcileSourceLocaleDictionary,
  readLocaleDictionary,
  syncLocaleFiles,
  writeLocaleDictionary
} from "../src/i18n/localeManager";
import { prepareTransformProject } from "../src/cli/pipeline";
import { createTestConfig } from "./testUtils";
import { GlobalyzeError } from "../src/utils/errors";
import { mkdir, writeFile } from "node:fs/promises";

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
        `Locales directory does not exist: ${config.localesDir}. Run "globalyze transform" or "globalyze sync" first.`
      )
    );
  });

  it("preserves the existing source locale and removes stale languages on re-sync", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locales-"));
    tempDirectories.push(rootDir);

    const initialConfig = createTestConfig(rootDir, {
      languages: ["en", "fr", "de"]
    });

    await syncLocaleFiles(
      initialConfig,
      buildSourceLocale([
        {
          key: "checkout.buy_button",
          text: "Buy now",
          file: "src/app/page.tsx"
        }
      ])
    );

    const updatedConfig = createTestConfig(rootDir, {
      languages: ["en", "es", "ar"]
    });

    const result = await syncLocaleFiles(updatedConfig, {});

    expect(result.removed).toEqual(["de", "fr"]);
    expect(result.sourceKeyCount).toBe(1);
    expect(await readLocaleDictionary(updatedConfig, "en")).toEqual({
      "checkout.buy_button": "Buy now"
    });
    expect(await readLocaleDictionary(updatedConfig, "es")).toEqual({
      "checkout.buy_button": ""
    });
  });

  it("merges incremental source locale updates without dropping existing keys", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locales-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir);

    await syncLocaleFiles(
      config,
      buildSourceLocale([
        {
          key: "checkout.buy_button",
          text: "Buy now",
          file: "src/app/page.tsx"
        }
      ])
    );

    const merged = await mergeSourceLocaleDictionary(config, {
      "support.contact_button": "Contact support"
    });

    expect(merged).toEqual({
      "checkout.buy_button": "Buy now",
      "support.contact_button": "Contact support"
    });
  });

  it("reconciles source locale updates by removing inactive keys", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locales-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir);

    await syncLocaleFiles(
      config,
      buildSourceLocale([
        {
          key: "checkout.buy_button",
          text: "Buy now",
          file: "src/app/page.tsx"
        },
        {
          key: "support.contact_button",
          text: "Contact support",
          file: "src/app/page.tsx"
        }
      ])
    );

    const reconciled = await reconcileSourceLocaleDictionary(
      config,
      {},
      ["support.contact_button"]
    );

    expect(reconciled).toEqual({
      "support.contact_button": "Contact support"
    });
  });

  it("fails clearly when the project is already transformed but the source locale is empty", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locales-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir);
    const filePath = path.join(rootDir, "src", "app", "page.tsx");

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        'import { t } from "@/i18n";',
        "export default function Page() {",
        '  return <button>{t("checkout.buy_button")}</button>;',
        "}",
        ""
      ].join("\n")
    );

    await syncLocaleFiles(config, {});

    expect(prepareTransformProject(config)).rejects.toThrow(
      new GlobalyzeError(
        `The project appears to be already transformed, but the source locale output for en is empty in ${config.localesDir}. Globalyze cannot rebuild source strings from translation keys alone. Restore the source locale files from git, or rerun Globalyze on an untransformed source tree.`
      )
    );
  });

  it("preserves component assignments during sync for already transformed projects", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locales-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      localeStructure: {
        format: "js",
        structure: "multiple",
        splitStrategy: "component",
        commonFile: false,
        naming: "dot"
      }
    });
    const appFilePath = path.join(rootDir, "src", "app", "page.tsx");
    const heroFilePath = path.join(rootDir, "src", "components", "MarketingHero.tsx");

    await mkdir(path.dirname(appFilePath), { recursive: true });
    await mkdir(path.dirname(heroFilePath), { recursive: true });
    await writeFile(
      appFilePath,
      [
        'import { MarketingHero } from "@/components/MarketingHero";',
        'import { t } from "@/i18n";',
        "export default function Page() {",
        "  return (",
        "    <main>",
        '      <h1>{t("home.title")}</h1>',
        "      <MarketingHero />",
        "    </main>",
        "  );",
        "}",
        ""
      ].join("\n")
    );
    await writeFile(
      heroFilePath,
      [
        'import { t } from "@/i18n";',
        "export function MarketingHero() {",
        '  return <section>{t("home.hero.button.book_demo")}</section>;',
        "}",
        ""
      ].join("\n")
    );

    await syncLocaleFiles(
      config,
      {
        "home.title": "Global releases without the spreadsheet tax",
        "home.hero.button.book_demo": "Book demo"
      },
      {
        sourceAssignments: [
          {
            key: "home.title",
            file: appFilePath,
            pageName: "home",
            pageNames: ["home"],
            sourceType: "page"
          },
          {
            key: "home.hero.button.book_demo",
            file: heroFilePath,
            pageName: "home",
            pageNames: ["home"],
            componentName: "marketingHero",
            sourceType: "component"
          }
        ]
      }
    );

    const prepared = await prepareTransformProject(config);
    const heroAssignment = prepared.sourceAssignments.find(
      (entry) => entry.key === "home.hero.button.book_demo"
    );
    const pageAssignment = prepared.sourceAssignments.find(
      (entry) => entry.key === "home.title"
    );

    expect(prepared.rawStrings).toHaveLength(0);
    expect(prepared.keyAssignments).toHaveLength(0);
    expect(heroAssignment).toMatchObject({
      key: "home.hero.button.book_demo",
      componentName: "marketingHero"
    });
    expect(pageAssignment).toMatchObject({
      key: "home.title",
      pageName: "home"
    });
  });
});
