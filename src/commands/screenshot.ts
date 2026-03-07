import path from "node:path";

import { Command } from "commander";

import { scanScreenshotForUntranslatedText } from "../ocr/screenshotScanner";
import type { GlobalyzeConfig } from "../types";
import { loadGlobalyzeConfig, pathExists } from "../utils/fileUtils";
import { GlobalyzeError } from "../utils/errors";
import { logger } from "../utils/logger";
import { logInterruptHint } from "../utils/progress";

function buildOverrides(options: {
  sourceDir?: string;
  localesDir?: string;
}): Partial<GlobalyzeConfig> {
  return {
    ...(options.sourceDir ? { sourceDir: options.sourceDir } : {}),
    ...(options.localesDir ? { localesDir: options.localesDir } : {})
  };
}

export function registerScreenshotCommand(program: Command): void {
  program
    .command("screenshot")
    .argument("<image>", "Path to a screenshot image")
    .description("Analyze a screenshot and flag UI text missing from locales")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (
        imagePath: string,
        options: {
          config?: string;
          sourceDir?: string;
          localesDir?: string;
        }
      ) => {
        await executeScreenshotCommand(imagePath, options);
      }
    );
}

export async function executeScreenshotCommand(
  imagePath: string,
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
  const resolvedImagePath = path.resolve(process.cwd(), imagePath);

  if (!(await pathExists(resolvedImagePath))) {
    throw new GlobalyzeError(`Screenshot file does not exist: ${resolvedImagePath}`);
  }

  const result = await logger.step(
    "Analyzing screenshot text",
    () => scanScreenshotForUntranslatedText(resolvedImagePath, config),
    (scanResult) =>
      `Detected ${String(scanResult.detectedText.length)} OCR text blocks`
  );

  if (result.untranslatedText.length === 0) {
    logger.success("No untranslated screenshot text detected.");
    return result;
  }

  logger.warn("Detected UI text not localized:");
  logger.list(result.untranslatedText.map((text) => `"${text}"`));

  return result;
}
