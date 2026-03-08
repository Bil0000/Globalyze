import { Command } from "commander";

import { inspectLocaleLanguage } from "../inspection/translationInspector";
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

export function registerLocalesCommand(program: Command): void {
  program
    .command("locales <language> [scope]")
    .description("Inspect locale files")
    .summary("Show locale entries for a language or a single page/component scope")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (
        language: string,
        scope: string | undefined,
        options: { config?: string; sourceDir?: string; localesDir?: string }
      ) => {
        await executeLocalesCommand(language, scope, options);
      }
    );
}

export async function executeLocalesCommand(
  language: string,
  scope?: string,
  options: { config?: string; sourceDir?: string; localesDir?: string } = {}
) {
  const config = await loadGlobalyzeConfig(options.config, buildOverrides(options));
  const files = await inspectLocaleLanguage(config, language, scope);

  if (files.length === 0) {
    throw new GlobalyzeError(
      scope
        ? `No locale entries matched "${scope}" for language "${language}".`
        : `No locale entries were found for language "${language}".`
    );
  }

  logger.heading(`Language: ${language}`);

  for (const file of files) {
    logger.newline();
    logger.info(`File: ${file.fileName}`);

    for (const [key, entry] of Object.entries(file.entries)) {
      logger.info(`${key} = "${entry.value}"`);
    }
  }

  return files;
}
