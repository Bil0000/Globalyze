import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { executeChangeStyleCommand } from "../src/commands/changeStyle";
import { executeInitCommand } from "../src/commands/init";
import {
  buildSourceLocale,
  readLocaleDictionary,
  syncLocaleFiles
} from "../src/i18n/localeManager";
import { scanProjectFiles } from "../src/scanner/projectScanner";
import { extractTranslationKeyReferencesFromFiles } from "../src/extractor/translationKeyExtractor";
import type { LocaleStructureConfig } from "../src/types";
import { createTestConfig } from "./testUtils";

describe("locale file structures", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
  });

  it("writes single JSON locale files inside language folders", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locale-style-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      localeStructure: {
        format: "json",
        structure: "single",
        splitStrategy: "page",
        commonFile: false,
        naming: "dot"
      }
    });

    await syncLocaleFiles(
      config,
      buildSourceLocale([
        {
          key: "checkout.buy_button",
          text: "Buy now",
          file: "src/checkout/page.tsx"
        }
      ])
    );

    const englishLocale = await readFile(
      path.join(rootDir, "locales", "en", "en.json"),
      "utf8"
    );
    const frenchLocale = await readFile(
      path.join(rootDir, "locales", "fr", "fr.json"),
      "utf8"
    );

    expect(englishLocale).toContain('"checkout.buy_button": "Buy now"');
    expect(frenchLocale).toContain('"checkout.buy_button": ""');
  });

  it("writes multiple JSON locale files and moves repeated values into common.json", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locale-style-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      localeStructure: {
        format: "json",
        structure: "multiple",
        splitStrategy: "page",
        commonFile: true,
        naming: "dot"
      }
    });
    const assignments = [
      {
        key: "checkout.title",
        text: "Checkout",
        file: "src/checkout/page.tsx"
      },
      {
        key: "checkout.save",
        text: "Save",
        file: "src/checkout/page.tsx"
      },
      {
        key: "profile.title",
        text: "Profile",
        file: "src/profile/page.tsx"
      },
      {
        key: "profile.save",
        text: "Save",
        file: "src/profile/page.tsx"
      }
    ] as const;

    await syncLocaleFiles(config, buildSourceLocale(assignments), {
      sourceAssignments: assignments
    });

    const commonLocale = await readFile(
      path.join(rootDir, "locales", "en", "common.json"),
      "utf8"
    );
    const checkoutLocale = await readFile(
      path.join(rootDir, "locales", "en", "checkout.page.json"),
      "utf8"
    );
    const profileLocale = await readFile(
      path.join(rootDir, "locales", "en", "profile.page.json"),
      "utf8"
    );

    expect(commonLocale).toContain('"checkout.save": "Save"');
    expect(commonLocale).toContain('"profile.save": "Save"');
    expect(checkoutLocale).toContain('"checkout.title": "Checkout"');
    expect(checkoutLocale).not.toContain('"checkout.save"');
    expect(profileLocale).toContain('"profile.title": "Profile"');
    expect(profileLocale).not.toContain('"profile.save"');
  });

  it("writes single JS locale files with const exports", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locale-style-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      localeStructure: {
        format: "js",
        structure: "single",
        splitStrategy: "page",
        commonFile: false,
        naming: "dot"
      }
    });

    await syncLocaleFiles(
      config,
      buildSourceLocale([
        {
          key: "checkout.buy_button",
          text: "Buy now",
          file: "src/checkout/page.tsx"
        }
      ])
    );

    const englishLocale = await readFile(
      path.join(rootDir, "locales", "en", "en.js"),
      "utf8"
    );

    expect(englishLocale).toContain("export const en =");
    expect(englishLocale).toContain('"checkout.buy_button": "Buy now"');
    expect(await readLocaleDictionary(config, "en")).toEqual({
      "checkout.buy_button": "Buy now"
    });
  });

  it("writes multiple JS locale files by component", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locale-style-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      localeStructure: {
        format: "js",
        structure: "multiple",
        splitStrategy: "component",
        commonFile: false,
        naming: "camel"
      }
    });
    const assignments = [
      {
        key: "header.title",
        text: "Dashboard",
        file: "src/components/Header.tsx"
      },
      {
        key: "cart.checkout",
        text: "Checkout",
        file: "src/components/Cart.tsx"
      }
    ] as const;

    await syncLocaleFiles(config, buildSourceLocale(assignments), {
      sourceAssignments: assignments
    });

    const headerLocale = await readFile(
      path.join(rootDir, "locales", "en", "headerComponent.js"),
      "utf8"
    );
    const cartLocale = await readFile(
      path.join(rootDir, "locales", "en", "cartComponent.js"),
      "utf8"
    );

    expect(headerLocale).toContain("export const headerComponent =");
    expect(headerLocale).toContain('"header.title": "Dashboard"');
    expect(cartLocale).toContain("export const cartComponent =");
    expect(cartLocale).toContain('"cart.checkout": "Checkout"');
  });

  it("writes multiple JSON locale files with snake_case naming", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locale-style-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      localeStructure: {
        format: "json",
        structure: "multiple",
        splitStrategy: "page",
        commonFile: false,
        naming: "snake"
      }
    });

    const assignments = [
      {
        key: "pricing.title",
        text: "Pricing",
        file: "src/pricing/page.tsx"
      }
    ] as const;

    await syncLocaleFiles(config, buildSourceLocale(assignments), {
      sourceAssignments: assignments
    });

    const pricingLocale = await readFile(
      path.join(rootDir, "locales", "en", "pricing_page.json"),
      "utf8"
    );

    expect(pricingLocale).toContain('"pricing.title": "Pricing"');
  });

  it("groups component-owned keys into the parent page file when split by page", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locale-style-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      localeStructure: {
        format: "js",
        structure: "multiple",
        splitStrategy: "page",
        commonFile: false,
        naming: "camel"
      }
    });

    await mkdir(path.join(rootDir, "src", "app"), { recursive: true });
    await mkdir(path.join(rootDir, "src", "components"), { recursive: true });
    await writeFile(
      path.join(rootDir, "src", "app", "page.tsx"),
      [
        'import { MarketingHero } from "@/components/MarketingHero";',
        'import { PricingSection } from "@/components/PricingSection";',
        "export default function HomePage() {",
        "  return (",
        "    <main>",
        "      <MarketingHero />",
        "      <PricingSection />",
        "    </main>",
        "  );",
        "}",
        ""
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      path.join(rootDir, "src", "components", "MarketingHero.tsx"),
      [
        'import { t } from "@/i18n";',
        "export function MarketingHero() {",
        '  return <h1>{t("home.hero_title")}</h1>;',
        "}",
        ""
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      path.join(rootDir, "src", "components", "PricingSection.tsx"),
      [
        'import { t } from "@/i18n";',
        "export function PricingSection() {",
        '  return <button>{t("home.page.button.start_rollout")}</button>;',
        "}",
        ""
      ].join("\n"),
      "utf8"
    );

    const files = await scanProjectFiles(config);
    const references = await extractTranslationKeyReferencesFromFiles(
      files,
      config.translationFunctionName
    );

    await syncLocaleFiles(
      config,
      {
        "home.hero_title": "Grow faster",
        "home.page.button.start_rollout": "Start rollout"
      },
      {
        sourceAssignments: references
      }
    );

    const homePageLocale = await readFile(
      path.join(rootDir, "locales", "en", "homePage.js"),
      "utf8"
    );

    expect(homePageLocale).toContain('"home.hero_title": "Grow faster"');
    expect(homePageLocale).toContain(
      '"home.page.button.start_rollout": "Start rollout"'
    );
    let marketingHeroExists = true;

    try {
      await readFile(
        path.join(rootDir, "locales", "en", "marketingHeroPage.js"),
        "utf8"
      );
    } catch {
      marketingHeroExists = false;
    }

    let pricingSectionExists = true;

    try {
      await readFile(
        path.join(rootDir, "locales", "en", "pricingSectionPage.js"),
        "utf8"
      );
    } catch {
      pricingSectionExists = false;
    }

    expect(marketingHeroExists).toBe(false);
    expect(pricingSectionExists).toBe(false);
  });

  it("reorganizes existing locale files during change-style without regenerating keys", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-change-style-"));
    tempDirectories.push(rootDir);
    const originalCwd = process.cwd();
    process.chdir(rootDir);

    try {
      await mkdir(path.join(rootDir, "src", "checkout"), { recursive: true });
      await mkdir(path.join(rootDir, "src", "support"), { recursive: true });
      await writeFile(
        path.join(rootDir, "src", "checkout", "page.tsx"),
        [
          'import { t } from "@/i18n";',
          "export default function CheckoutPage() {",
          '  return <button>{t("checkout.buy_button")}</button>;',
          "}",
          ""
        ].join("\n"),
        "utf8"
      );
      await writeFile(
        path.join(rootDir, "src", "support", "page.tsx"),
        [
          'import { t } from "@/i18n";',
          "export default function SupportPage() {",
          '  return <button>{t("support.contact_button")}</button>;',
          "}",
          ""
        ].join("\n"),
        "utf8"
      );

      await executeInitCommand({
        localeStructure: {
          format: "json",
          structure: "single",
          splitStrategy: "page",
          commonFile: false,
          naming: "dot"
        }
      });

      const baseConfig = createTestConfig(rootDir);
      await syncLocaleFiles(baseConfig, {
        "checkout.buy_button": "Buy now",
        "support.contact_button": "Contact support"
      });

      const nextLocaleStructure: LocaleStructureConfig = {
        format: "json",
        structure: "multiple",
        splitStrategy: "page",
        commonFile: false,
        naming: "dot"
      };

      await executeChangeStyleCommand({
        localeStructure: nextLocaleStructure
      });

      const checkoutLocale = await readFile(
        path.join(rootDir, "locales", "en", "checkout.page.json"),
        "utf8"
      );
      const supportLocale = await readFile(
        path.join(rootDir, "locales", "en", "support.page.json"),
        "utf8"
      );

      expect(checkoutLocale).toContain('"checkout.buy_button": "Buy now"');
      expect(supportLocale).toContain(
        '"support.contact_button": "Contact support"'
      );
    } finally {
      process.chdir(originalCwd);
    }
  });
});
