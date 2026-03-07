import { Command } from "commander";

import { createDefaultConfigContents, pathExists, writeTextFile } from "../utils/fileUtils";
import { GlobalyzeError } from "../utils/errors";
import { logger } from "../utils/logger";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create a globalyze.config.ts file in the current directory")
    .option("-f, --force", "Overwrite an existing config file")
    .action(async (options: { force?: boolean }) => {
      const configPath = "globalyze.config.ts";

      if ((await pathExists(configPath)) && !options.force) {
        throw new GlobalyzeError(
          `Config already exists at ${configPath}. Re-run with --force to overwrite it.`
        );
      }

      await writeTextFile(configPath, createDefaultConfigContents());
      logger.success(`created ${configPath}`);
    });
}
