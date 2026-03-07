import { Command } from "commander";

import { createKeyAssignments, generateSemanticKeys } from "../ai/keyGenerator";
import { extractStringsFromFiles } from "../extractor/stringExtractor";
import { buildSourceLocale, syncLocaleFiles } from "../i18n/localeManager";
import { scanProjectFiles } from "../scanner/projectScanner";
import { transformFiles } from "../transformer/astTransformer";
import type { ExtractedString, GlobalyzeConfig } from "../types";
import { loadGlobalyzeConfig, toRelativePosixPath } from "../utils/fileUtils";
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
  logger.hint("Press Ctrl+C at any time to stop Globalyze safely.");
  const files = await logger.step(
    "Scanning source files",
    () => scanProjectFiles(config),
    (discoveredFiles) =>
      `Discovered ${String(discoveredFiles.length)} source files`
  );
  const rawStrings = await logger.step(
    "Extracting hardcoded UI strings",
    () => extractStringsFromFiles(files),
    (strings) => `Extracted ${String(strings.length)} UI strings`
  );
  const keySourceStrings: ExtractedString[] = rawStrings.map((item) => ({
    ...item,
    file: toRelativePosixPath(config.sourceDir, item.file)
  }));
  const keyResult = await logger.step(
    "Generating translation keys",
    () =>
      generateSemanticKeys(keySourceStrings, {
        model: config.aiModel,
        batchSize: config.aiBatchSize
      }),
    (result) =>
      `Generated ${String(result.keysByText.size)} translation keys${
        result.usedFallback ? " using fallback mode" : ""
      }`
  );

  if (keyResult.fallbackReason) {
    logger.warn(keyResult.fallbackReason);
  }

  const transformedFiles = await logger.step(
    "Transforming source files",
    () => transformFiles(files, keyResult.keysByText, config),
    (results) =>
      `Transformed ${String(results.filter((item) => item.updated).length)} files`
  );
  const keyAssignments = createKeyAssignments(
    keySourceStrings,
    keyResult.keysByText
  );
  const localeSync = await logger.step(
    "Syncing locale files",
    () => syncLocaleFiles(config, buildSourceLocale(keyAssignments)),
    () => `Updated locale files in ${config.localesDir}`
  );
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
    files,
    rawStrings,
    keyAssignments,
    transformedFiles,
    localeSync,
    usedFallbackKeys: keyResult.usedFallback
  };
}
