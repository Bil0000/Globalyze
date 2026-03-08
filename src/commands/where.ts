import { Command } from "commander";

import { findTranslationKeyUsages } from "../inspection/translationInspector";
import type { GlobalyzeConfig } from "../types";
import { GlobalyzeError } from "../utils/errors";
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

export function registerWhereCommand(program: Command): void {
  program
    .command("where <key>")
    .description("Show where a key is used")
    .summary("List source files that reference a translation key")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(async (key: string, options: {
      config?: string;
      sourceDir?: string;
      localesDir?: string;
    }) => {
      await executeWhereCommand(key, options);
    });
}

export async function executeWhereCommand(
  key: string,
  options: {
    config?: string;
    sourceDir?: string;
    localesDir?: string;
  } = {}
) {
  const config = await loadGlobalyzeConfig(options.config, buildOverrides(options));
  const usages = await findTranslationKeyUsages(key, config.rootDir);

  if (!usages) {
    throw new GlobalyzeError(`Translation key "${key}" was not found in the graph.`);
  }

  logger.heading(key);

  if (usages.length === 0) {
    logger.info("Used in: No recorded usages");
    return usages;
  }

  logger.info("Used in:");
  logger.list(usages);

  return usages;
}
