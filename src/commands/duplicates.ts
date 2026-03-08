import { Command } from "commander";

import { readLocaleDictionary } from "../i18n/localeManager";
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

export function registerDuplicatesCommand(program: Command): void {
  program
    .command("duplicates")
    .description("Detect duplicate translation keys")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(async (options: { config?: string; sourceDir?: string; localesDir?: string }) => {
      await executeDuplicatesCommand(options);
    });
}

export async function executeDuplicatesCommand(
  options: { config?: string; sourceDir?: string; localesDir?: string } = {}
) {
  const config = await loadGlobalyzeConfig(options.config, buildOverrides(options));
  const sourceLocale = await readLocaleDictionary(config, config.sourceLocale);
  const buckets = new Map<string, string[]>();

  for (const [key, text] of Object.entries(sourceLocale)) {
    const keys = buckets.get(text) ?? [];
    keys.push(key);
    buckets.set(text, keys);
  }

  const duplicates = [...buckets.entries()]
    .filter(([, keys]) => keys.length > 1)
    .map(([text, keys]) => ({ text, keys }));

  if (duplicates.length === 0) {
    logger.success("No duplicate source texts were found.");
    return duplicates;
  }

  for (const duplicate of duplicates) {
    logger.info(`"${duplicate.text}"`);
    logger.list(duplicate.keys);
  }

  return duplicates;
}
