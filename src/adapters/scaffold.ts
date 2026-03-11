import path from "node:path";
import fg from "fast-glob";

import { detectRuntimeArtifactFlavor } from "../runtime/languageArtifacts";
import type { ResolvedGlobalyzeConfig } from "../types";
import { pathExists, readTextFile, writeTextFile } from "../utils/fileUtils";

export interface LocalAdapterRuntimeResult {
  path: string;
  action: "created" | "updated";
}

function resolveLocalAdapterModulePath(
  config: ResolvedGlobalyzeConfig
): string | null {
  const importPath = config.translationImportPath;

  if (importPath.startsWith("@/")) {
    return path.join(config.sourceDir, `${importPath.slice(2)}.ts`);
  }

  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    return path.resolve(config.rootDir, `${importPath}.ts`);
  }

  return null;
}

function isGeneratedLocalAdapterRuntime(contents: string): boolean {
  return (
    contents.includes("export type TranslationValues") &&
    contents.includes("export function t") &&
    (
      contents.includes('globalyze.locale') ||
      contents.includes("return key.replace(/\\{(\\w+)\\}/g") ||
      contents.includes("function interpolateTranslation(")
    )
  );
}

async function resolveGeneratedManifestImportPath(
  config: ResolvedGlobalyzeConfig,
  runtimePath: string
): Promise<string | null> {
  const manifests = await fg(["**/translations.generated.{ts,js}"], {
    cwd: config.rootDir,
    absolute: true,
    onlyFiles: true,
    ignore: [...config.ignore.map((segment) => `${segment}/**`), "locales/**"]
  });

  if (manifests.length !== 1) {
    return null;
  }

  const manifestPath = manifests[0];

  if (!manifestPath) {
    return null;
  }

  const relativePath = path
    .relative(path.dirname(runtimePath), manifestPath)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "");

  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

async function resolveDefaultGeneratedManifestImportPath(
  config: ResolvedGlobalyzeConfig,
  runtimePath: string
): Promise<string> {
  const flavor = await detectRuntimeArtifactFlavor(config);
  const extension = flavor === "typescript" ? "ts" : "js";
  const manifestPath = path.join(
    config.sourceDir,
    "lib",
    "i18n",
    `translations.generated.${extension}`
  );
  const relativePath = path
    .relative(path.dirname(runtimePath), manifestPath)
    .replace(/\\/g, "/")
    .replace(/\.(ts|js)$/, "");

  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

export async function ensureLocalAdapterRuntime(
  config: ResolvedGlobalyzeConfig
): Promise<LocalAdapterRuntimeResult | null> {
  if (config.i18nAdapter !== "generic" && config.i18nAdapter !== "custom") {
    return null;
  }

  const runtimePath = resolveLocalAdapterModulePath(config);

  if (!runtimePath) {
    return null;
  }

  const functionName = config.translationFunctionName;
  const manifestImportPath =
    (await resolveGeneratedManifestImportPath(config, runtimePath)) ??
    (await resolveDefaultGeneratedManifestImportPath(config, runtimePath));
  const contents = manifestImportPath
    ? [
        `import { getTranslations } from ${JSON.stringify(manifestImportPath)};`,
        "",
        "export type TranslationValues = Record<string, string | number | boolean | null | undefined>;",
        "",
        "function interpolateTranslation(",
        "  value: string,",
        "  values?: TranslationValues",
        "): string {",
        "  if (!values) {",
        "    return value;",
        "  }",
        "",
        "  return value.replace(/\\{(\\w+)\\}/g, (_, name: string) => {",
        "    const nextValue = values[name];",
        '    return nextValue === undefined || nextValue === null ? `{${name}}` : String(nextValue);',
        "  });",
        "}",
        "",
        "function resolveRuntimeLocale(locale?: string): string {",
        "  if (locale) {",
        "    return locale;",
        "  }",
        "",
        "  if (typeof window !== \"undefined\") {",
        `    return window.localStorage.getItem("globalyze.locale") ?? ${JSON.stringify(config.sourceLocale)};`,
        "  }",
        "",
        `  return ${JSON.stringify(config.sourceLocale)};`,
        "}",
        "",
        `export function ${functionName}(`,
        "  key: string,",
        "  values?: TranslationValues,",
        "  locale?: string",
        "): string {",
        "  const activeLocale = resolveRuntimeLocale(locale);",
        "  const activeTranslations = getTranslations(activeLocale) as Record<string, string>;",
        `  const fallbackTranslations = getTranslations(${JSON.stringify(config.sourceLocale)}) as Record<string, string>;`,
        "  const template = activeTranslations[key] ?? fallbackTranslations[key] ?? key;",
        "  return interpolateTranslation(template, values);",
        "}",
        ""
      ].join("\n")
    : [
        "export type TranslationValues = Record<string, string | number | boolean | null | undefined>;",
        "",
        `export function ${functionName}(key: string, values?: TranslationValues): string {`,
        "  if (!values) {",
        "    return key;",
        "  }",
        "",
        "  return key.replace(/\\{(\\w+)\\}/g, (_, name: string) => {",
        "    const value = values[name];",
        '    return value === undefined || value === null ? `{${name}}` : String(value);',
        "  });",
        "}",
        ""
      ].join("\n");

  if (await pathExists(runtimePath)) {
    const existingContents = await readTextFile(runtimePath);

    if (!isGeneratedLocalAdapterRuntime(existingContents)) {
      return null;
    }

    if (existingContents === `${contents}\n` || existingContents === contents) {
      return null;
    }

    await writeTextFile(runtimePath, contents);
    return {
      path: runtimePath,
      action: "updated"
    };
  }

  await writeTextFile(runtimePath, contents);
  return {
    path: runtimePath,
    action: "created"
  };
}
