import { Command } from "commander";

import { collectProjectStrings } from "../cli/pipeline";
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

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Scan the project and print hardcoded JSX strings")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .option("--json", "Print the scan result as JSON", false)
    .option(
      "--fail-on-findings",
      "Exit with a non-zero code if hardcoded strings are found",
      false
    )
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
        json?: boolean;
        failOnFindings?: boolean;
      }) => {
        const config = await loadGlobalyzeConfig(
          options.config,
          buildOverrides(options)
        );
        const result = await collectProjectStrings(config);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          logger.success("scanning project");
          logger.success(`found ${String(result.files.length)} source files`);
          logger.success(`extracted ${String(result.strings.length)} strings`);

          if (result.strings.length > 0) {
            logger.list(
              result.strings.map(
                (item) => `${item.file}:${String(item.line)} "${item.text}"`
              )
            );
          }
        }

        if (options.failOnFindings && result.strings.length > 0) {
          throw new GlobalyzeError("Hardcoded UI strings detected.");
        }
      }
    );
}
