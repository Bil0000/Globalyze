import { Command } from "commander";

import { prepareTransformProject } from "../cli/pipeline";
import { buildSourceLocale, syncLocaleFiles } from "../i18n/localeManager";
import { translateLocales } from "../lingo/lingoClient";
import { transformFiles } from "../transformer/astTransformer";
import type { GlobalyzeConfig, TranslationResult } from "../types";
import { loadGlobalyzeConfig } from "../utils/fileUtils";
import { logger } from "../utils/logger";
import {
  logFallbackReason,
  logInterruptHint,
  logReusedKeyCount
} from "../utils/progress";

function buildOverrides(options: {
  sourceDir?: string;
  localesDir?: string;
}): Partial<GlobalyzeConfig> {
  return {
    ...(options.sourceDir ? { sourceDir: options.sourceDir } : {}),
    ...(options.localesDir ? { localesDir: options.localesDir } : {})
  };
}

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run the full globalization pipeline")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
      }) => {
        await executeRunCommand(options);
      }
    );
}

export async function executeRunCommand(
  options: {
    config?: string;
    sourceDir?: string;
    localesDir?: string;
  } = {}
) {
  const config = await logger.step(
    "Loading configuration",
    () => loadGlobalyzeConfig(options.config, buildOverrides(options)),
    "Loaded configuration"
  );
  logInterruptHint();
  const prepared = await logger.step(
    "Preparing transformation plan",
    () => prepareTransformProject(config),
    (result) =>
      `Prepared ${String(result.keyAssignments.length)} translation keys from ${String(result.rawStrings.length)} UI strings`
  );
  logFallbackReason(prepared.fallbackReason);
  logReusedKeyCount(prepared.reusedExistingKeys);

  const transformedFiles = await logger.step(
    "Transforming source files",
    () => transformFiles(prepared.files, prepared.keysByText, config),
    (results) =>
      `Transformed ${String(results.filter((item) => item.updated).length)} files`
  );
  const localeSync = await logger.step(
    "Syncing locale files",
    () =>
      syncLocaleFiles(config, buildSourceLocale(prepared.keyAssignments), {
        sourceAssignments: prepared.keyAssignments
      }),
    () => `Updated locale files in ${config.localesDir}`
  );
  let translation: TranslationResult = {
    translatedLocales: [],
    usedMockTranslations: false,
    skippedReason: "No source locale keys exist yet."
  };

  if (localeSync.sourceKeyCount > 0) {
    translation = await logger.step(
      "Translating locale files",
      () => translateLocales(config),
      (result) =>
        `Translated ${String(result.translatedLocales.length)} languages${
          result.usedMockTranslations ? " using English fallback values" : ""
        }`
    );
  } else {
    logger.warn("Skipping translation because no source locale keys exist yet.");
  }

  if (translation.usedMockTranslations) {
    logger.warn(
      translation.skippedReason ??
        "English source values were copied to target locales."
    );
  }
  if (localeSync.removed.length > 0) {
    logger.info(`Removed stale locales: ${localeSync.removed.join(", ")}`);
  }
  if (translation.skippedReason) {
    logger.info(translation.skippedReason);
  }

  const updatedFiles = transformedFiles.filter((item) => item.updated);
  logger.info(`Pipeline complete: ${String(updatedFiles.length)} files updated`);

  return {
    transformedFiles,
    localeSync,
    translation
  };
}
