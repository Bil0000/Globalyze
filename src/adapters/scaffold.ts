import path from "node:path";

import type { ResolvedGlobalyzeConfig } from "../types";
import { pathExists, writeTextFile } from "../utils/fileUtils";

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

export async function ensureLocalAdapterRuntime(
  config: ResolvedGlobalyzeConfig
): Promise<string | null> {
  if (config.i18nAdapter !== "generic" && config.i18nAdapter !== "custom") {
    return null;
  }

  const runtimePath = resolveLocalAdapterModulePath(config);

  if (!runtimePath || (await pathExists(runtimePath))) {
    return null;
  }

  const functionName = config.translationFunctionName;
  const contents = [
    "type TranslationValues = Record<string, string | number | boolean | null | undefined>;",
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

  await writeTextFile(runtimePath, contents);
  return runtimePath;
}
