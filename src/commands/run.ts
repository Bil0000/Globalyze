import { Command } from "commander";

import { createKeyAssignments, generateSemanticKeys } from "../ai/keyGenerator";
import { extractStringsFromFiles } from "../extractor/stringExtractor";
import { buildSourceLocale, syncLocaleFiles } from "../i18n/localeManager";
import { translateLocales } from "../lingo/lingoClient";
import { scanProjectFiles } from "../scanner/projectScanner";
import { transformFiles } from "../transformer/astTransformer";
import type {
  ExtractedString,
  GlobalyzeConfig,
  TranslationResult
} from "../types";
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
                result.usedMockTranslations
                  ? " using English fallback values"
                  : ""
              }`
          );
        } else {
          logger.warn("Skipping translation because no source locale keys exist yet.");
        }

        if (translation.usedMockTranslations) {
          logger.warn(
            "LINGO_API_KEY is not set, so English source values were copied to target locales."
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
      }
    );
}
