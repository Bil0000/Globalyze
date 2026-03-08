import { Command } from "commander";

import { scanProjectFiles } from "../scanner/projectScanner";
import { reverseDynamicTransformFile } from "../dynamic/reverseDynamicTransform";
import type { GlobalyzeConfig } from "../types";
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

export function registerDynamicRemoveCommand(program: Command): void {
  program
    .command("dynamic-remove")
    .description("Revert dynamic extraction transforms")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(async (options: { config?: string; sourceDir?: string; localesDir?: string }) => {
      await executeDynamicRemoveCommand(options);
    });
}

export async function executeDynamicRemoveCommand(
  options: { config?: string; sourceDir?: string; localesDir?: string } = {}
) {
  const config = await loadGlobalyzeConfig(options.config, buildOverrides(options));
  const files = await scanProjectFiles(config);
  const results = [];

  for (const filePath of files) {
    results.push(await reverseDynamicTransformFile(filePath, config));
  }

  logger.success(
    `Reverted dynamic translations in ${String(results.filter((item) => item.updated).length)} files`
  );

  return results;
}
