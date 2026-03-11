import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { executeChangeStyleCommand } from "../src/commands/changeStyle";
import { executeSyncCommand } from "../src/commands/sync";
import { refreshGeneratedTranslationManifests } from "../src/runtime/translationsManifest";
import type { LocaleStructureConfig } from "../src/types";
import { createTestConfig } from "./testUtils";

function createConfigFile(
  localeStructure: Partial<LocaleStructureConfig> = {}
): string {
  return [
    "export default {",
    '  sourceDir: "src",',
    '  localesDir: "locales",',
    '  languages: ["en", "ar"],',
    '  ignore: ["node_modules", "dist", "build", ".next", ".git"],',
    `  localeStructure: { format: "${localeStructure.format ?? "js"}", structure: "${localeStructure.structure ?? "multiple"}", splitStrategy: "${localeStructure.splitStrategy ?? "page"}", commonFile: ${localeStructure.commonFile ?? true ? "true" : "false"}, naming: "${localeStructure.naming ?? "camel"}", unresolvedOwnership: "${localeStructure.unresolvedOwnership ?? "common"}" },`,
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
  ].join("\n");
}

describe("generated translation manifest refresh", () => {
  const tempDirectories: string[] = [];
  const originalCwd = process.cwd();

  afterEach(async () => {
    process.chdir(originalCwd);
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
  });

  it("rewrites translations.generated.ts from the current locale file layout", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-runtime-manifest-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "ar"],
      localeStructure: {
        format: "js",
        structure: "multiple",
        splitStrategy: "page",
        commonFile: true,
        naming: "camel",
        unresolvedOwnership: "common"
      }
    });

    await mkdir(path.join(rootDir, "src", "lib", "i18n"), { recursive: true });
    await mkdir(path.join(rootDir, "locales", "en"), { recursive: true });
    await mkdir(path.join(rootDir, "locales", "ar"), { recursive: true });
    await writeFile(
      path.join(rootDir, "src", "lib", "i18n", "translations.generated.ts"),
      "// placeholder\n"
    );
    await writeFile(
      path.join(rootDir, "locales", "en", "homePage.js"),
      'export const homePage = {"home.title":"Home"};\n'
    );
    await writeFile(
      path.join(rootDir, "locales", "en", "common.js"),
      'export const common = {"common.save":"Save"};\n'
    );
    await writeFile(
      path.join(rootDir, "locales", "ar", "homePage.js"),
      'export const homePage = {"home.title":"الرئيسية"};\n'
    );
    await writeFile(
      path.join(rootDir, "locales", "ar", "common.js"),
      'export const common = {"common.save":"حفظ"};\n'
    );

    const paths = await refreshGeneratedTranslationManifests(config);
    const manifest = await readFile(
      path.join(rootDir, "src", "lib", "i18n", "translations.generated.ts"),
      "utf8"
    );

    expect(paths).toEqual([
      path.join(rootDir, "src", "lib", "i18n", "translations.generated.ts")
    ]);
    expect(manifest).toContain('import { homePage as en_home_page } from "../../../locales/en/homePage.js";');
    expect(manifest).toContain('import { common as ar_common } from "../../../locales/ar/common.js";');
    expect(manifest).toContain('export const translations = {');
    expect(manifest).toContain("export function getTranslations(locale: string)");
    expect(manifest).toContain("en: locale_en,");
    expect(manifest).toContain("ar: locale_ar,");
  });

  it("updates generated manifest imports after changing locale style", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-style-manifest-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);

    await mkdir(path.join(rootDir, "src", "app"), { recursive: true });
    await mkdir(path.join(rootDir, "src", "lib", "i18n"), { recursive: true });
    await writeFile(
      path.join(rootDir, "globalyze.config.ts"),
      createConfigFile({
        format: "js",
        structure: "multiple",
        splitStrategy: "page",
        commonFile: true,
        naming: "camel",
        unresolvedOwnership: "common"
      })
    );
    await writeFile(
      path.join(rootDir, "src", "lib", "i18n", "translations.generated.ts"),
      "// placeholder\n"
    );
    await writeFile(
      path.join(rootDir, "src", "app", "page.tsx"),
      'export default function Page() { return <button>Checkout</button>; }\n'
    );

    await executeSyncCommand({
      config: path.join(rootDir, "globalyze.config.ts")
    });

    const before = await readFile(
      path.join(rootDir, "src", "lib", "i18n", "translations.generated.ts"),
      "utf8"
    );

    expect(before).toContain("homePage.js");

    await executeChangeStyleCommand({
      config: path.join(rootDir, "globalyze.config.ts"),
      localeStructure: {
        format: "js",
        structure: "multiple",
        splitStrategy: "page",
        commonFile: true,
        naming: "snake",
        unresolvedOwnership: "common"
      }
    });

    const after = await readFile(
      path.join(rootDir, "src", "lib", "i18n", "translations.generated.ts"),
      "utf8"
    );

    expect(after).toContain("home_page.js");
    expect(after).not.toContain("homePage.js");
  });

  it("imports TypeScript locale files without a .ts extension in generated manifests", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-runtime-manifest-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "ar"],
      localeStructure: {
        format: "ts",
        structure: "multiple",
        splitStrategy: "page",
        commonFile: true,
        naming: "camel",
        unresolvedOwnership: "common"
      }
    });

    await mkdir(path.join(rootDir, "src", "lib", "i18n"), { recursive: true });
    await mkdir(path.join(rootDir, "locales", "en"), { recursive: true });
    await mkdir(path.join(rootDir, "locales", "ar"), { recursive: true });
    await writeFile(
      path.join(rootDir, "src", "lib", "i18n", "translations.generated.ts"),
      "// placeholder\n"
    );
    await writeFile(
      path.join(rootDir, "locales", "en", "homePage.ts"),
      'export const homePage = {"home.title":"Home"} as const;\n'
    );
    await writeFile(
      path.join(rootDir, "locales", "ar", "homePage.ts"),
      'export const homePage = {"home.title":"الرئيسية"} as const;\n'
    );

    await refreshGeneratedTranslationManifests(config);
    const manifest = await readFile(
      path.join(rootDir, "src", "lib", "i18n", "translations.generated.ts"),
      "utf8"
    );

    expect(manifest).toContain('import { homePage as en_home_page } from "../../../locales/en/homePage";');
    expect(manifest).toContain('import { homePage as ar_home_page } from "../../../locales/ar/homePage";');
    expect(manifest).toContain('} as const;');
  });

  it("falls back to an empty module object when a translated locale bucket is missing", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-runtime-manifest-missing-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "fr"],
      localeStructure: {
        format: "js",
        structure: "multiple",
        splitStrategy: "page",
        commonFile: true,
        naming: "camel",
        unresolvedOwnership: "common"
      }
    });

    await mkdir(path.join(rootDir, "src", "lib", "i18n"), { recursive: true });
    await mkdir(path.join(rootDir, "locales", "en"), { recursive: true });
    await mkdir(path.join(rootDir, "locales", "fr"), { recursive: true });
    await writeFile(
      path.join(rootDir, "src", "lib", "i18n", "translations.generated.ts"),
      "// placeholder\n"
    );
    await writeFile(
      path.join(rootDir, "locales", "en", "homePage.js"),
      'export const homePage = {"home.title":"Home"};\n'
    );
    await writeFile(
      path.join(rootDir, "locales", "en", "dashboardPage.js"),
      'export const dashboardPage = {"dashboard.title":"Dashboard"};\n'
    );
    await writeFile(
      path.join(rootDir, "locales", "fr", "homePage.js"),
      'export const homePage = {"home.title":"Accueil"};\n'
    );

    await refreshGeneratedTranslationManifests(config);
    const manifest = await readFile(
      path.join(rootDir, "src", "lib", "i18n", "translations.generated.ts"),
      "utf8"
    );

    expect(manifest).toContain(
      'import { dashboardPage as en_dashboard_page } from "../../../locales/en/dashboardPage.js";'
    );
    expect(manifest).not.toContain("../../../locales/fr/dashboardPage.js");
    expect(manifest).toContain("const fr_dashboard_page = {} as const;");
  });

  it("creates a generated manifest at the default runtime location when none exists yet", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-runtime-manifest-create-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir, {
      languages: ["en", "ar"],
      localeStructure: {
        format: "js",
        structure: "multiple",
        splitStrategy: "page",
        commonFile: true,
        naming: "camel",
        unresolvedOwnership: "common"
      }
    });

    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await mkdir(path.join(rootDir, "locales", "en"), { recursive: true });
    await mkdir(path.join(rootDir, "locales", "ar"), { recursive: true });
    await writeFile(
      path.join(rootDir, "locales", "en", "homePage.js"),
      'export const homePage = {"home.title":"Home"};\n'
    );
    await writeFile(
      path.join(rootDir, "locales", "ar", "homePage.js"),
      'export const homePage = {"home.title":"الرئيسية"};\n'
    );

    const paths = await refreshGeneratedTranslationManifests(config);
    const manifestPath = path.join(
      rootDir,
      "src",
      "lib",
      "i18n",
      "translations.generated.js"
    );
    const manifest = await readFile(manifestPath, "utf8");

    expect(paths).toEqual([manifestPath]);
    expect(manifest).toContain('import { homePage as en_home_page } from "../../../locales/en/homePage.js";');
    expect(manifest).toContain("export function getTranslations(locale)");
  });
});
