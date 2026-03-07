import { Command } from "commander";

import { runFullPipeline } from "../cli/pipeline";
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

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Run the full globalization pipeline")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
      }) => {
        const config = await loadGlobalyzeConfig(
          options.config,
          buildOverrides(options)
        );
        const result = await runFullPipeline(config);
        const updatedFiles = result.transform.transformedFiles.filter(
          (item) => item.updated
        );

        logger.success("scanning project");
        logger.success(
          `extracted ${String(result.transform.strings.length)} strings`
        );
        logger.success(
          `generated ${String(result.transform.keyAssignments.length)} translation keys${
            result.transform.usedFallbackKeys ? " using fallback mode" : ""
          }`
        );
        logger.success(`transformed ${String(updatedFiles.length)} files`);
        logger.success(`generated locales in ${config.localesDir}`);
        logger.success(
          `translated ${String(result.translation.translatedLocales.length)} languages${
            result.translation.usedMockTranslations
              ? " using English fallback values"
              : ""
          }`
        );
      }
    );
}
