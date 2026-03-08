import { Command } from "commander";

import { extractTranslationKeysFromFiles } from "../extractor/translationKeyExtractor";
import { readLocaleDictionary, writeLocaleDictionary } from "../i18n/localeManager";
import { scanProjectFiles } from "../scanner/projectScanner";
import type { GlobalyzeConfig, LocaleDictionary } from "../types";
import { loadGlobalyzeConfig } from "../utils/fileUtils";

function buildOverrides(options: {
  sourceDir?: string;
  localesDir?: string;
}): Partial<GlobalyzeConfig> {
  return {
    ...(options.sourceDir ? { sourceDir: options.sourceDir } : {}),
    ...(options.localesDir ? { localesDir: options.localesDir } : {})
  };
}

export function registerCleanCommand(program: Command): void {
  program
    .command("clean")
    .description("Detect unused locale keys and optionally remove them")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .option("--fix", "Remove unused keys from locale files", false)
    .action(async (options: { config?: string; sourceDir?: string; localesDir?: string; fix?: boolean }) => {
      await executeCleanCommand(options);
    });
}

export async function executeCleanCommand(
  options: { config?: string; sourceDir?: string; localesDir?: string; fix?: boolean } = {}
) {
  const config = await loadGlobalyzeConfig(options.config, buildOverrides(options));
  const files = await scanProjectFiles(config);
  const activeKeys = new Set(
    await extractTranslationKeysFromFiles(files, config.translationFunctionName)
  );
  const unusedByLanguage: Record<string, string[]> = {};

  for (const language of config.languages) {
    const locale = await readLocaleDictionary(config, language);
    const unusedKeys = Object.keys(locale).filter((key) => !activeKeys.has(key));
    unusedByLanguage[language] = unusedKeys;

    if (options.fix && unusedKeys.length > 0) {
      const nextLocale: LocaleDictionary = Object.fromEntries(
        Object.entries(locale).filter(([key]) => activeKeys.has(key))
      );
      await writeLocaleDictionary(config, language, nextLocale);
    }
  }

  return unusedByLanguage;
}
