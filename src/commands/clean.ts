import { Command } from "commander";

import { extractTranslationKeysFromFiles } from "../extractor/translationKeyExtractor";
import { readLocaleDictionary, writeLocaleDictionary } from "../i18n/localeManager";
import { scanProjectFiles } from "../scanner/projectScanner";
import type { GlobalyzeConfig, LocaleDictionary } from "../types";
import { loadGlobalyzeConfig } from "../utils/fileUtils";
import { logger } from "../utils/logger";

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
    .description("Remove unused translations")
    .summary("Detect or delete locale keys no longer used in source")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .option("--fix", "Remove unused keys from locale files", false)
    .addHelpText(
      "after",
      [
        "",
        "Actions performed:",
        "- scan source files",
        "- detect active translation keys",
        "- compare locale entries",
        "- optionally remove unused keys with --fix",
        ""
      ].join("\n")
    )
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

  const totalUnused = Object.values(unusedByLanguage).reduce(
    (count, keys) => count + keys.length,
    0
  );

  if (totalUnused === 0) {
    logger.success("No unused locale keys were found.");
    return unusedByLanguage;
  }

  logger.heading(options.fix ? "Unused Translations Removed" : "Unused Translations Found");
  logger.info(`Total Unused Keys: ${String(totalUnused)}`);
  for (const [language, keys] of Object.entries(unusedByLanguage)) {
    if (keys.length === 0) {
      continue;
    }
    logger.info(`${language}: ${String(keys.length)} keys`);
    logger.list(keys);
  }

  return unusedByLanguage;
}
