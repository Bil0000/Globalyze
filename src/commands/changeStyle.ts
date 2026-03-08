import path from "node:path";

import { Command } from "commander";

import { promptLocaleStructure } from "./init";
import { extractTranslationKeyReferencesFromFiles } from "../extractor/translationKeyExtractor";
import {
  readLocaleDictionary,
  syncLocaleFiles
} from "../i18n/localeManager";
import { scanProjectFiles } from "../scanner/projectScanner";
import type { LocaleStructureConfig } from "../types";
import { createConfigContents, loadGlobalyzeConfig, writeTextFile } from "../utils/fileUtils";
import { logger } from "../utils/logger";

function resolveConfigPath(configPath?: string): string {
  return path.resolve(process.cwd(), configPath ?? "globalyze.config.ts");
}

export function registerChangeStyleCommand(program: Command): void {
  program
    .command("style")
    .alias("change-style")
    .description("Change the locale file storage style without regenerating keys")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .action(async (options: { config?: string }) => {
      await executeChangeStyleCommand(options);
    });
}

export async function executeChangeStyleCommand(
  options: {
    config?: string;
    localeStructure?: LocaleStructureConfig;
  } = {}
): Promise<void> {
  const config = await logger.step(
    "Loading configuration",
    () => loadGlobalyzeConfig(options.config),
    "Loaded configuration"
  );
  const sourceLocale = await logger.step(
    "Reading existing locale data",
    () => readLocaleDictionary(config, config.sourceLocale),
    (locale) => `Loaded ${String(Object.keys(locale).length)} source locale keys`
  );
  const nextLocaleStructure =
    options.localeStructure ?? (await promptLocaleStructure());
  const nextConfig = {
    ...config,
    localeStructure: nextLocaleStructure
  };
  const configPath = resolveConfigPath(options.config);

  await logger.step(
    "Updating config file",
    () => writeTextFile(configPath, createConfigContents(nextConfig)),
    () => `Updated ${configPath}`
  );
  const sourceFiles = await logger.step(
    "Inspecting source file metadata",
    () => scanProjectFiles(nextConfig),
    (files) => `Indexed ${String(files.length)} source files`
  );
  const sourceAssignments = await logger.step(
    "Collecting translation key locations",
    () =>
      extractTranslationKeyReferencesFromFiles(
        sourceFiles,
        nextConfig.translationFunctionName
      ),
    (references) => `Mapped ${String(references.length)} key references`
  );
  const localeSync = await logger.step(
    "Rewriting locale files",
    () =>
      syncLocaleFiles(nextConfig, sourceLocale, {
        preserveExistingOnEmpty: false,
        sourceAssignments
      }),
    () => `Regenerated locale files in ${nextConfig.localesDir}`
  );

  if (localeSync.removed.length > 0) {
    logger.info(`Removed stale locales: ${localeSync.removed.join(", ")}`);
  }

  logger.success("Locale file style updated.");
}
