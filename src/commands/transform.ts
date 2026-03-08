import { Command } from "commander";

import { prepareTransformProject } from "../cli/pipeline";
import { extractTranslationKeyReferencesFromFiles } from "../extractor/translationKeyExtractor";
import { updateTranslationGraph } from "../graph/translationGraph";
import { buildSourceLocale, syncLocaleFiles } from "../i18n/localeManager";
import { transformFiles } from "../transformer/astTransformer";
import type { GlobalyzeConfig } from "../types";
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

export function registerTransformCommand(program: Command): void {
  program
    .command("transform")
    .description("Extract UI strings, generate keys, transform JSX, and sync locale files")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
      }) => {
        await executeTransformCommand(options);
      }
    );
}

export async function executeTransformCommand(
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
  const references = await extractTranslationKeyReferencesFromFiles(
    prepared.files,
    config.translationFunctionName
  );
  await updateTranslationGraph(config, references);
  const updatedFiles = transformedFiles.filter((item) => item.updated);

  logger.success(`transformed ${String(updatedFiles.length)} files`);
  logger.success(`Locale sync complete for ${config.languages.join(", ")}`);

  if (localeSync.created.length > 0) {
    logger.info(`Created locales: ${localeSync.created.join(", ")}`);
  }
  if (localeSync.removed.length > 0) {
    logger.info(`Removed stale locales: ${localeSync.removed.join(", ")}`);
  }
  if (localeSync.sourceKeyCount === 0) {
    logger.warn(
      "No source locale keys exist yet. Locale files were synced, but there was nothing to translate."
    );
  }

  return {
    config,
    files: prepared.files,
    rawStrings: prepared.rawStrings,
    keyAssignments: prepared.keyAssignments,
    transformedFiles,
    localeSync,
    usedFallbackKeys: prepared.usedFallbackKeys
  };
}
