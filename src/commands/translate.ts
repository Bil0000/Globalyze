import { Command } from "commander";

import { checkTranslationCoverage, translateProject } from "../cli/pipeline";
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

export function registerTranslateCommand(program: Command): void {
  program
    .command("translate")
    .description("Translate locale files with Lingo.dev or validate locale coverage")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .option("--check", "Fail when locale files have missing translations", false)
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
        check?: boolean;
      }) => {
        const config = await loadGlobalyzeConfig(
          options.config,
          buildOverrides(options)
        );

        if (options.check) {
          const report = await checkTranslationCoverage(config);
          const missingEntries = Object.entries(report).flatMap(
            ([language, keys]) => keys.map((key) => `${language}: ${key}`)
          );

          if (missingEntries.length > 0) {
            logger.error("Missing translation keys detected");
            logger.list(missingEntries);
            throw new GlobalyzeError("Locale coverage check failed.");
          }

          logger.success("all locale files are fully translated");
          return;
        }

        const result = await translateProject(config);

        logger.success(
          `translated ${String(result.translatedLocales.length)} languages${
            result.usedMockTranslations ? " using English fallback values" : ""
          }`
        );
      }
    );
}
