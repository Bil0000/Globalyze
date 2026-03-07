import path from "node:path";

import type { ResolvedGlobalyzeConfig } from "../src/types";

export function createTestConfig(
  rootDir: string,
  overrides: Partial<ResolvedGlobalyzeConfig> = {}
): ResolvedGlobalyzeConfig {
  return {
    rootDir,
    sourceDir: path.join(rootDir, "src"),
    localesDir: path.join(rootDir, "locales"),
    languages: ["en", "fr", "de", "ar"],
    ignore: ["node_modules", "dist", "build", ".next", ".git"],
    sourceLocale: "en",
    aiModel: "gpt-4o-mini",
    aiBatchSize: 20,
    translationImportPath: "@/i18n",
    translationFunctionName: "t",
    lingoApiUrl: undefined,
    ...overrides
  };
}
