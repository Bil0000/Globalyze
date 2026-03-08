import { Command } from "commander";

import { executeSyncCommand } from "./sync";
import { logger } from "../utils/logger";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Deprecated alias for sync")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
      }) => {
        await executeRunCommand(options);
      }
    );
}

export async function executeRunCommand(
  options: {
    config?: string;
    sourceDir?: string;
    localesDir?: string;
  } = {}
) {
  logger.warn("Warning: `globalyze run` is deprecated.");
  logger.info("Use `globalyze sync` instead.");
  return executeSyncCommand(options);
}
