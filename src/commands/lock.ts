import { Command } from "commander";

import { extractTranslationKeyReferencesFromFiles } from "../extractor/translationKeyExtractor";
import { updateTranslationGraph } from "../graph/translationGraph";
import { readLocaleEntries, updateTranslationMetadata } from "../i18n/localeManager";
import { scanProjectFiles } from "../scanner/projectScanner";
import { loadGlobalyzeConfig } from "../utils/fileUtils";
import { GlobalyzeError } from "../utils/errors";
import { logger } from "../utils/logger";

async function updateLockState(
  key: string,
  locked: boolean,
  options: { config?: string }
): Promise<void> {
  const config = await loadGlobalyzeConfig(options.config);
  const sourceLocale = await readLocaleEntries(config, config.sourceLocale);

  if (!sourceLocale[key]) {
    throw new GlobalyzeError(`Translation key "${key}" does not exist.`);
  }

  await updateTranslationMetadata(config, key, { locked });
  const files = await scanProjectFiles(config);
  const references = await extractTranslationKeyReferencesFromFiles(
    files,
    config.translationFunctionName
  );
  await updateTranslationGraph(config, references);
  logger.success(`${locked ? "Locked" : "Unlocked"} ${key}`);
}

export function registerLockCommand(program: Command): void {
  program
    .command("lock <key>")
    .description("Lock a translation key against automatic value changes")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .action(async (key: string, options: { config?: string }) => {
      await executeLockCommand(key, options);
    });
}

export function registerUnlockCommand(program: Command): void {
  program
    .command("unlock <key>")
    .description("Unlock a translation key so it can be updated again")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .action(async (key: string, options: { config?: string }) => {
      await executeUnlockCommand(key, options);
    });
}

export async function executeLockCommand(
  key: string,
  options: { config?: string } = {}
) {
  await updateLockState(key, true, options);
}

export async function executeUnlockCommand(
  key: string,
  options: { config?: string } = {}
) {
  await updateLockState(key, false, options);
}
