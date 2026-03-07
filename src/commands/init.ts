import { Command } from "commander";

import { inferTranslationInstructions } from "../context/appContext";
import {
  createDefaultConfigContents,
  normalizeLanguageCodes,
  pathExists,
  writeTextFile
} from "../utils/fileUtils";
import { GlobalyzeError } from "../utils/errors";
import { logger } from "../utils/logger";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create a globalyze.config.ts file in the current directory")
    .option("-f, --force", "Overwrite an existing config file")
    .option(
      "--langs <codes>",
      "Comma-separated language list to use instead of the defaults"
    )
    .action(async (options: { force?: boolean; langs?: string }) => {
      await executeInitCommand(options);
    });
}

export async function executeInitCommand(
  options: {
    force?: boolean;
    langs?: string;
  } = {}
): Promise<void> {
  const configPath = "globalyze.config.ts";

  if ((await pathExists(configPath)) && !options.force) {
    throw new GlobalyzeError(
      `Config already exists at ${configPath}. Re-run with --force to overwrite it.`
    );
  }

  const languages = options.langs
    ? normalizeLanguageCodes(options.langs.split(","))
    : undefined;
  const translationInstructions = await inferTranslationInstructions(process.cwd());

  await writeTextFile(
    configPath,
    createDefaultConfigContents(languages, translationInstructions)
  );
  logger.success(
    `created ${configPath}${
      languages ? ` with languages ${languages.join(", ")}` : ""
    }`
  );
  logger.info("Added editable translationInstructions based on the current app.");
}
