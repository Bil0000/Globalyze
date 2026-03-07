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
    translationInstructions: [
      "This is a React application with user-facing UI text.",
      "Keep labels, actions, and short UI text concise and natural for the target locale.",
      "Do not translate brand names or product names unless they are already localized."
    ],
    sourceLocale: "en",
    openAiModel: "gpt-4o-mini",
    geminiModel: "gemini-2.5-flash-lite",
    aiBatchSize: 20,
    translationImportPath: "@/i18n",
    translationFunctionName: "t",
    lingoApiUrl: undefined,
    ...overrides
  };
}
