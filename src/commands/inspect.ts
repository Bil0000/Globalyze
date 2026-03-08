import { Command } from "commander";

import {
  inspectTranslationKey
} from "../inspection/translationInspector";
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

export function registerInspectCommand(program: Command): void {
  program
    .command("inspect <key>")
    .description("Inspect a translation key")
    .summary("Show value, ownership, files, and usages for a key")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (
        key: string,
        options: { config?: string; sourceDir?: string; localesDir?: string }
      ) => {
        await executeInspectCommand(key, options);
      }
    );
}

export async function executeInspectCommand(
  key: string,
  options: { config?: string; sourceDir?: string; localesDir?: string } = {}
) {
  const config = await loadGlobalyzeConfig(options.config, buildOverrides(options));
  const result = await inspectTranslationKey(config, key);

  if (!result) {
    throw new GlobalyzeError(`Translation key "${key}" was not found.`);
  }

  logger.heading(`Key: ${result.key}`);
  logger.info(`Value: ${result.value}`);
  logger.info(`Defined in: ${result.originFile ?? "Unknown"}`);
  logger.info(`Locale file: ${result.localeFile ?? "Unknown"}`);
  logger.info(`Owner: ${result.owner ?? "Unassigned"}`);
  logger.info(`Locked: ${String(result.locked ?? false)}`);
  logger.info(
    `Approval Required: ${String(result.approvalRequired ?? false)}`
  );

  if (result.usages.length > 0) {
    logger.info("Used in:");
    logger.list(result.usages);
  } else {
    logger.info("Used in: No recorded usages");
  }

  return result;
}
