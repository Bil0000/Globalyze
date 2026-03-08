import { Command } from "commander";

import { extractTranslationKeyReferencesFromFiles } from "../extractor/translationKeyExtractor";
import { updateTranslationGraph } from "../graph/translationGraph";
import { readLocaleEntries, updateTranslationMetadata } from "../i18n/localeManager";
import { scanProjectFiles } from "../scanner/projectScanner";
import { loadGlobalyzeConfig } from "../utils/fileUtils";
import { GlobalyzeError } from "../utils/errors";
import { logger } from "../utils/logger";

export function registerOwnerCommand(program: Command): void {
  program
    .command("owner <key> <team>")
    .description("Assign or update the owner for a translation key")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .action(async (key: string, team: string, options: { config?: string }) => {
      await executeOwnerCommand(key, team, options);
    });
}

export async function executeOwnerCommand(
  key: string,
  team: string,
  options: { config?: string } = {}
) {
  const config = await loadGlobalyzeConfig(options.config);
  const sourceLocale = await readLocaleEntries(config, config.sourceLocale);

  if (!sourceLocale[key]) {
    throw new GlobalyzeError(`Translation key "${key}" does not exist.`);
  }

  await updateTranslationMetadata(config, key, {
    owner: team
  });
  const files = await scanProjectFiles(config);
  const references = await extractTranslationKeyReferencesFromFiles(
    files,
    config.translationFunctionName
  );
  await updateTranslationGraph(config, references);
  logger.success(`Assigned owner ${team} to ${key}`);
}
