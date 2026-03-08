import path from "node:path";

import { Command } from "commander";

import { prepareTransformProject } from "../cli/pipeline";
import { buildSourceLocale, syncLocaleFiles } from "../i18n/localeManager";
import { translateLocales } from "../lingo/lingoClient";
import type { TranslationResult } from "../types";
import { transformFiles } from "../transformer/astTransformer";
import {
  createConfigContents,
  loadGlobalyzeConfig,
  normalizeLanguageCodes,
  writeTextFile
} from "../utils/fileUtils";
import { logger } from "../utils/logger";
import {
  logFallbackReason,
  logReusedKeyCount
} from "../utils/progress";

function resolveConfigPath(configPath?: string): string {
  return path.resolve(process.cwd(), configPath ?? "globalyze.config.ts");
}

export function registerLanguagesCommand(program: Command): void {
  program
    .command("add <codes...>")
    .description("Add one or more languages to globalyze.config.ts")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .action(async (codes: string[], options: { config?: string }) => {
      await executeAddLanguagesCommand(codes, options);
    });
}

export async function executeAddLanguagesCommand(
  codes: readonly string[],
  options: {
    config?: string;
  } = {}
): Promise<void> {
  const config = await logger.step(
    "Loading configuration",
    () => loadGlobalyzeConfig(options.config),
    "Loaded configuration"
  );
  const nextLanguages = normalizeLanguageCodes(
    [...config.languages, ...codes],
    config.sourceLocale
  );
  const addedLanguages = nextLanguages.filter(
    (language) => !config.languages.includes(language)
  );

  if (addedLanguages.length === 0) {
    logger.info("No new languages were added.");
    return;
  }

  const configPath = resolveConfigPath(options.config);
  const nextConfig = {
    ...config,
    languages: nextLanguages
  };

  await logger.step(
    "Updating config file",
    () => writeTextFile(configPath, createConfigContents(nextConfig)),
    () => `Updated ${configPath}`
  );

  const prepared = await logger.step(
    "Inspecting project state",
    () => prepareTransformProject(nextConfig),
    (result) =>
      result.rawStrings.length > 0
        ? `Found ${String(result.rawStrings.length)} hardcoded UI strings that still need keys`
        : "Detected an already-keyed project"
  );
  logFallbackReason(prepared.fallbackReason);
  logReusedKeyCount(prepared.reusedExistingKeys);

  if (prepared.rawStrings.length > 0) {
    await logger.step(
      "Transforming source files",
      () => transformFiles(prepared.files, prepared.keysByText, nextConfig),
      (results) =>
        `Transformed ${String(results.filter((item) => item.updated).length)} files`
    );
  } else {
    logger.info("Using existing translation keys from source files.");
  }

  const localeSync = await logger.step(
    "Syncing locale files",
    () =>
      syncLocaleFiles(
        nextConfig,
        prepared.rawStrings.length > 0
          ? buildSourceLocale(prepared.keyAssignments)
          : {},
        {
          ...(prepared.rawStrings.length > 0
            ? { sourceAssignments: prepared.keyAssignments }
            : {})
        }
      ),
    () =>
      prepared.rawStrings.length > 0
        ? `Generated locale files for ${addedLanguages.join(", ")} from transformed source`
        : `Added locale support for ${addedLanguages.join(", ")}`
  );
  let translation: TranslationResult | undefined;

  if (localeSync.sourceKeyCount > 0) {
    translation = await logger.step(
      "Translating locale files",
      () => translateLocales(nextConfig),
      (result) =>
        `Translated ${String(result.translatedLocales.length)} languages${
          result.usedMockTranslations ? " using English fallback values" : ""
        }`
    );
  }

  if (translation?.usedMockTranslations) {
    logger.warn(
      translation.skippedReason ??
        "English source values were copied to target locales."
    );
  }

  logger.success(`Languages configured: ${nextLanguages.join(", ")}`);
}
