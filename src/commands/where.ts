import { Command } from "commander";

import { findTranslationKeyUsages } from "../inspection/translationInspector";
import { GlobalyzeError } from "../utils/errors";
import { logger } from "../utils/logger";

export function registerWhereCommand(program: Command): void {
  program
    .command("where <key>")
    .description("Show where a key is used")
    .summary("List source files that reference a translation key")
    .action(async (key: string) => {
      await executeWhereCommand(key);
    });
}

export async function executeWhereCommand(key: string) {
  const usages = await findTranslationKeyUsages(key);

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
