import path from "node:path";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { executeGlobalizeCommand } from "../src/commands/globalize";
import { executeLockCommand, executeUnlockCommand } from "../src/commands/lock";
import { executeOwnerCommand } from "../src/commands/owner";
import { executeRunCommand } from "../src/commands/run";
import { executeSyncCommand } from "../src/commands/sync";
import { readLocaleEntries } from "../src/i18n/localeManager";
import { loadGlobalyzeConfig, writeTextFile } from "../src/utils/fileUtils";

describe("sync-related commands", () => {
  const tempDirectories: string[] = [];
  const originalCwd = process.cwd();

  afterEach(async () => {
    process.chdir(originalCwd);
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  it("syncs an already-globalized project", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-sync-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await writeTextFile(
      path.join(rootDir, "globalyze.config.ts"),
      [
        "export default {",
        '  sourceDir: "src",',
        '  localesDir: "locales",',
        '  languages: ["en", "fr"],',
        '  ignore: ["node_modules", "dist", "build", ".next", ".git"],',
        '  localeStructure: { format: "json", structure: "single", splitStrategy: "page", commonFile: false, naming: "dot" },',
        "  cacheTranslations: true,",
        "  dynamicExtraction: false,",
        '  i18nAdapter: "generic",',
        "  translationInstructions: [],",
        '  sourceLocale: "en",',
        '  openAiModel: "gpt-4o-mini",',
        '  geminiModel: "gemini-2.5-flash-lite",',
        "  aiBatchSize: 20,",
        '  translationImportPath: "@/i18n",',
        '  translationFunctionName: "t",',
        "  governance: { enabled: false, failOnLockedChange: true, failOnApprovalRequiredChange: false }",
        "};",
        ""
      ].join("\n")
    );
    await writeTextFile(
      path.join(rootDir, "src", "page.tsx"),
      'export default function Page() { return <button>Checkout</button>; }\n'
    );

    const result = await executeSyncCommand();
    const english = await readFile(path.join(rootDir, "locales", "en", "en.json"), "utf8");
    const runtimeModule = await readFile(path.join(rootDir, "src", "i18n.ts"), "utf8");

    expect(result.localeSync.sourceKeyCount).toBeGreaterThan(0);
    expect(english).toContain("Checkout");
    expect(runtimeModule).toContain("export function t");
  });

  it("scaffolds a runtime module that matches the generated translations manifest contract", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-sync-runtime-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);
    await mkdir(path.join(rootDir, "src", "lib", "i18n"), { recursive: true });
    await writeTextFile(
      path.join(rootDir, "globalyze.config.ts"),
      [
        "export default {",
        '  sourceDir: "src",',
        '  localesDir: "locales",',
        '  languages: ["en"],',
        '  ignore: ["node_modules", "dist", "build", ".next", ".git"],',
        '  localeStructure: { format: "json", structure: "single", splitStrategy: "page", commonFile: false, naming: "dot" },',
        "  cacheTranslations: true,",
        "  dynamicExtraction: false,",
        '  i18nAdapter: "generic",',
        "  translationInstructions: [],",
        '  sourceLocale: "en",',
        '  openAiModel: "gpt-4o-mini",',
        '  geminiModel: "gemini-2.5-flash-lite",',
        "  aiBatchSize: 20,",
        '  translationImportPath: "@/i18n",',
        '  translationFunctionName: "t",',
        "  governance: { enabled: false, failOnLockedChange: true, failOnApprovalRequiredChange: false }",
        "};",
        ""
      ].join("\n")
    );
    await writeFile(
      path.join(rootDir, "src", "lib", "i18n", "translations.generated.ts"),
      [
        "export const translations = {",
        '  en: { "checkout.button": "Checkout" }',
        "} as const;",
        "",
        "export function getTranslations(locale: string) {",
        "  return translations[locale as keyof typeof translations] ?? translations.en;",
        "}",
        ""
      ].join("\n")
    );
    await writeTextFile(
      path.join(rootDir, "src", "page.tsx"),
      'export default function Page() { return <button>Checkout</button>; }\n'
    );

    await executeSyncCommand();

    const runtimeModule = await readFile(path.join(rootDir, "src", "i18n.ts"), "utf8");
    expect(runtimeModule).toContain('import { getTranslations } from "./lib/i18n/translations.generated"');
    expect(runtimeModule).toContain("const activeTranslations = getTranslations(activeLocale)");
  });

  it("keeps the run alias working with a deprecation warning", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-run-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await writeTextFile(
      path.join(rootDir, "globalyze.config.ts"),
      [
        "export default {",
        '  sourceDir: "src",',
        '  localesDir: "locales",',
        '  languages: ["en"],',
        '  ignore: ["node_modules", "dist", "build", ".next", ".git"],',
        '  localeStructure: { format: "json", structure: "single", splitStrategy: "page", commonFile: false, naming: "dot" },',
        "  cacheTranslations: true,",
        "  dynamicExtraction: false,",
        '  i18nAdapter: "generic",',
        "  translationInstructions: [],",
        '  sourceLocale: "en",',
        '  openAiModel: "gpt-4o-mini",',
        '  geminiModel: "gemini-2.5-flash-lite",',
        "  aiBatchSize: 20,",
        '  translationImportPath: "@/i18n",',
        '  translationFunctionName: "t",',
        "  governance: { enabled: false, failOnLockedChange: true, failOnApprovalRequiredChange: false }",
        "};",
        ""
      ].join("\n")
    );
    await writeTextFile(
      path.join(rootDir, "src", "page.tsx"),
      'export default function Page() { return <button>Checkout</button>; }\n'
    );

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = mock((message?: unknown) => {
      warnings.push(typeof message === "string" ? message : JSON.stringify(message));
    }) as typeof console.warn;

    try {
      await executeRunCommand();
    } finally {
      console.warn = originalWarn;
    }

    expect(warnings.some((message) => message.includes("deprecated"))).toBe(true);
  });

  it("creates runtime guidance during globalize for hook-based adapters", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-globalize-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await writeTextFile(
      path.join(rootDir, "globalyze.config.ts"),
      [
        "export default {",
        '  sourceDir: "src",',
        '  localesDir: "locales",',
        '  languages: ["en"],',
        '  ignore: ["node_modules", "dist", "build", ".next", ".git"],',
        '  localeStructure: { format: "json", structure: "single", splitStrategy: "page", commonFile: false, naming: "dot" },',
        "  cacheTranslations: true,",
        "  dynamicExtraction: false,",
        '  i18nAdapter: "react-i18next",',
        "  translationInstructions: [],",
        '  sourceLocale: "en",',
        '  openAiModel: "gpt-4o-mini",',
        '  geminiModel: "gemini-2.5-flash-lite",',
        "  aiBatchSize: 20,",
        '  translationImportPath: "@/i18n",',
        '  translationFunctionName: "t",',
        "  governance: { enabled: false, failOnLockedChange: true, failOnApprovalRequiredChange: false }",
        "};",
        ""
      ].join("\n")
    );
    await writeTextFile(
      path.join(rootDir, "src", "page.tsx"),
      'export default function Page() { return <button>Checkout</button>; }\n'
    );

    await executeGlobalizeCommand();

    const scaffold = await readFile(path.join(rootDir, "globalyze.runtime.md"), "utf8");
    expect(scaffold).toContain("react-i18next");
  });

  it("keeps per-page locale output aligned across all languages during globalize", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-globalize-page-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);
    await mkdir(path.join(rootDir, "src", "app"), { recursive: true });
    await mkdir(path.join(rootDir, "src", "components"), { recursive: true });
    await writeTextFile(
      path.join(rootDir, "globalyze.config.ts"),
      [
        "export default {",
        '  sourceDir: "src",',
        '  localesDir: "locales",',
        '  languages: ["en", "fr", "de", "ar"],',
        '  ignore: ["node_modules", "dist", "build", ".next", ".git"],',
        '  localeStructure: { format: "js", structure: "multiple", splitStrategy: "page", commonFile: true, naming: "camel" },',
        "  cacheTranslations: true,",
        "  dynamicExtraction: false,",
        '  i18nAdapter: "generic",',
        "  translationInstructions: [],",
        '  sourceLocale: "en",',
        '  openAiModel: "gpt-4o-mini",',
        '  geminiModel: "gemini-2.5-flash-lite",',
        "  aiBatchSize: 20,",
        '  translationImportPath: "@/i18n",',
        '  translationFunctionName: "t",',
        "  governance: { enabled: false, failOnLockedChange: true, failOnApprovalRequiredChange: false }",
        "};",
        ""
      ].join("\n")
    );
    await writeTextFile(
      path.join(rootDir, "src", "app", "page.tsx"),
      [
        'import { MarketingHero } from "@/components/MarketingHero";',
        'import { PricingSection } from "@/components/PricingSection";',
        "",
        "export default function HomePage() {",
        "  return (",
        "    <main>",
        "      <MarketingHero />",
        "      <PricingSection />",
        "      <button>Start rollout</button>",
        "    </main>",
        "  );",
        "}",
        ""
      ].join("\n")
    );
    await writeTextFile(
      path.join(rootDir, "src", "components", "MarketingHero.tsx"),
      [
        "export function MarketingHero() {",
        '  return <section><h1>Ship once</h1><button>Book demo</button></section>;',
        "}",
        ""
      ].join("\n")
    );
    await writeTextFile(
      path.join(rootDir, "src", "components", "PricingSection.tsx"),
      [
        "export function PricingSection() {",
        '  return <section><h2>Plans</h2><button>Talk to sales</button></section>;',
        "}",
        ""
      ].join("\n")
    );

    await executeGlobalizeCommand();

    const englishFiles = await readFile(
      path.join(rootDir, "locales", "en", "homePage.js"),
      "utf8"
    );
    const frenchFiles = await readFile(
      path.join(rootDir, "locales", "fr", "homePage.js"),
      "utf8"
    );

    expect(await Bun.file(path.join(rootDir, "locales", "en", "marketingheroPage.js")).exists()).toBe(false);
    expect(await Bun.file(path.join(rootDir, "locales", "en", "pricingsectionPage.js")).exists()).toBe(false);
    expect(englishFiles).toContain("Book demo");
    expect(englishFiles).toContain("Talk to sales");
    expect(frenchFiles).toContain('"home.');
  });

  it("updates owner and lock metadata", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-owner-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await writeTextFile(
      path.join(rootDir, "globalyze.config.ts"),
      [
        "export default {",
        '  sourceDir: "src",',
        '  localesDir: "locales",',
        '  languages: ["en"],',
        '  ignore: ["node_modules", "dist", "build", ".next", ".git"],',
        '  localeStructure: { format: "json", structure: "single", splitStrategy: "page", commonFile: false, naming: "dot" },',
        "  cacheTranslations: true,",
        "  dynamicExtraction: false,",
        '  i18nAdapter: "generic",',
        "  translationInstructions: [],",
        '  sourceLocale: "en",',
        '  openAiModel: "gpt-4o-mini",',
        '  geminiModel: "gemini-2.5-flash-lite",',
        "  aiBatchSize: 20,",
        '  translationImportPath: "@/i18n",',
        '  translationFunctionName: "t",',
        "  governance: { enabled: false, failOnLockedChange: true, failOnApprovalRequiredChange: false }",
        "};",
        ""
      ].join("\n")
    );
    await writeTextFile(
      path.join(rootDir, "src", "page.tsx"),
      [
        'import { t } from "@/i18n";',
        'export default function Page() { return <button>{t("checkout.button")}</button>; }',
        ""
      ].join("\n")
    );
    await writeTextFile(
      path.join(rootDir, "locales", "en", "en.json"),
      JSON.stringify({ "checkout.button": "Checkout" }, null, 2)
    );

    await executeOwnerCommand("checkout.button", "payments-team");
    await executeLockCommand("checkout.button");
    let entries = await readLocaleEntries(await loadGlobalyzeConfig(), "en");
    expect(entries["checkout.button"]?.owner).toBe("payments-team");
    expect(entries["checkout.button"]?.locked).toBe(true);

    await executeUnlockCommand("checkout.button");
    entries = await readLocaleEntries(await loadGlobalyzeConfig(), "en");
    expect(entries["checkout.button"]?.locked).toBe(false);
  });
});
