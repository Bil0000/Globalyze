import { Command } from "commander";

import { searchTranslations } from "../inspection/translationInspector";
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

export function registerSearchCommand(program: Command): void {
  program
    .command("search <text>")
    .description("Search translations by text")
    .summary("Find translation keys whose values match a query")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (
        text: string,
        options: { config?: string; sourceDir?: string; localesDir?: string }
      ) => {
        await executeSearchCommand(text, options);
      }
    );
}

export async function executeSearchCommand(
  text: string,
  options: { config?: string; sourceDir?: string; localesDir?: string } = {}
) {
  const config = await loadGlobalyzeConfig(options.config, buildOverrides(options));
  const matches = await searchTranslations(config, text);

  logger.heading("Matching Keys");

  if (matches.length === 0) {
    logger.info("No translation values matched the search text.");
    return matches;
  }

  logger.list(matches.map((match) => `${match.key} = "${match.value}"`));

  return matches;
}
