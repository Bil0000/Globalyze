import path from "node:path";
import fg from "fast-glob";

import { detectRuntimeArtifactFlavor } from "../runtime/languageArtifacts";
import type { ResolvedGlobalyzeConfig } from "../types";
import { pathExists, readTextFile, writeTextFile } from "../utils/fileUtils";
import { formatGeneratedFileContents } from "../utils/projectFormatter";

export interface LocalAdapterRuntimeResult {
  path: string;
  action: "created" | "updated";
}

async function resolveLocalAdapterModulePath(
  config: ResolvedGlobalyzeConfig
): Promise<string | null> {
  const importPath = config.translationImportPath;
  const flavor = await detectRuntimeArtifactFlavor(config);
  const extension = flavor === "typescript" ? "ts" : "js";

  if (importPath.startsWith("@/")) {
    return path.join(config.sourceDir, `${importPath.slice(2)}.${extension}`);
  }

  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    return path.resolve(config.rootDir, `${importPath}.${extension}`);
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

  const runtimePath = await resolveLocalAdapterModulePath(config);

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
        "function readCookieLocale(cookieSource: string | null | undefined): string | null {",
        "  if (!cookieSource) {",
        "    return null;",
        "  }",
        "",
        "  const cookies = cookieSource.split(/;\\s*/).filter(Boolean);",
        '  const match = cookies.find((entry) => entry.startsWith("globalyze.locale="));',
        '  return match ? decodeURIComponent(match.slice("globalyze.locale".length + 1)) : null;',
        "}",
        "",
        "function readServerCookieLocale(): string | null {",
        "  if (typeof window !== \"undefined\") {",
        "    return null;",
        "  }",
        "",
        "  try {",
        "    const maybeRequire = Function(",
        "      'return typeof require !== \"undefined\" ? require : null;'",
        "    )() as ((specifier: string) => unknown) | null;",
        "",
        "    if (!maybeRequire) {",
        "      return null;",
        "    }",
        "",
        "    const nextHeaders = maybeRequire(\"next/headers\") as {",
        "      cookies?: () => { get: (name: string) => { value?: string } | undefined };",
        "    };",
        "    const cookieStore = typeof nextHeaders.cookies === \"function\" ? nextHeaders.cookies() : null;",
        '    const cookie = cookieStore?.get("globalyze.locale");',
        '    return typeof cookie?.value === "string" && cookie.value.trim().length > 0 ? cookie.value : null;',
        "  } catch {",
        "    return null;",
        "  }",
        "}",
        "",
        "function resolveRuntimeLocale(locale?: string): string {",
        "  if (locale) {",
        "    return locale;",
        "  }",
        "",
        "  const serverLocale = readServerCookieLocale();",
        "  if (serverLocale) {",
        "    return serverLocale;",
        "  }",
        "",
        "  if (typeof window !== \"undefined\") {",
        "    const cookieLocale = readCookieLocale(",
        '      typeof document !== "undefined" ? document.cookie : null',
        "    );",
        "",
        "    if (cookieLocale) {",
        "      return cookieLocale;",
        "    }",
        "",
        `    return window.localStorage.getItem("globalyze.locale") ?? ${JSON.stringify(config.sourceLocale)};`,
        "  }",
        "",
        `  return ${JSON.stringify(config.sourceLocale)};`,
        "}",
        "",
        "export function getCurrentLocale(locale?: string): string {",
        "  return resolveRuntimeLocale(locale);",
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
  const formattedContents = await formatGeneratedFileContents(runtimePath, contents);

  if (await pathExists(runtimePath)) {
    const existingContents = await readTextFile(runtimePath);

    if (!isGeneratedLocalAdapterRuntime(existingContents)) {
      return null;
    }

    if (
      existingContents === `${formattedContents}\n` ||
      existingContents === formattedContents
    ) {
      return null;
    }

    await writeTextFile(runtimePath, formattedContents);
    return {
      path: runtimePath,
      action: "updated"
    };
  }

  await writeTextFile(runtimePath, formattedContents);
  return {
    path: runtimePath,
    action: "created"
  };
}
