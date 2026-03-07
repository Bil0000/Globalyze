import { Command } from "commander";

import { transformProject } from "../cli/pipeline";
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

export function registerTransformCommand(program: Command): void {
  program
    .command("transform")
    .description("Extract UI strings, generate keys, transform JSX, and sync locale files")
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
        const result = await transformProject(config);
        const updatedFiles = result.transformedFiles.filter((item) => item.updated);

        logger.success("scanning project");
        logger.success(`extracted ${String(result.strings.length)} strings`);
        logger.success(
          `generated ${String(result.keyAssignments.length)} translation keys${
            result.usedFallbackKeys ? " using fallback mode" : ""
          }`
        );
        logger.success(`transformed ${String(updatedFiles.length)} files`);
        logger.success(
          `generated locales for ${config.languages.join(", ")} in ${config.localesDir}`
        );
      }
    );
}
