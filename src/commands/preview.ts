import chalk from "chalk";
import { Command } from "commander";

import { generateTransformPreview } from "../preview/transformPreview";
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

export function registerPreviewCommand(program: Command): void {
  program
    .command("preview")
    .description("Preview source transformations without modifying files")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
      }) => {
        await executePreviewCommand(options);
      }
    );
}

export async function executePreviewCommand(
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
  const preview = await logger.step(
    "Generating transformation preview",
    () => generateTransformPreview(config),
    (result) => `Prepared preview for ${String(result.files.length)} files`
  );

  logFallbackReason(preview.fallbackReason);
  logReusedKeyCount(preview.reusedExistingKeys);

  console.log(chalk.bold("🌍 Globalyze Preview"));

  if (preview.files.length === 0) {
    logger.info("No changes would be made.");
    return preview;
  }

  for (const file of preview.files) {
    console.log();
    console.log(chalk.cyan(`File: ${file.relativePath}`));
    console.log(chalk.gray("BEFORE"));
    console.log(file.before);
    console.log(chalk.gray("AFTER"));
    console.log(file.after);
    console.log(chalk.gray("DIFF"));
    console.log(chalk.gray(file.diff));
  }

  return preview;
}
