import { Command } from "commander";

import { buildLocalizationDoctorReport } from "../inspection/translationInspector";
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

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Show localization health report")
    .summary("Inspect translation health, coverage, and config style")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
      }) => {
        await executeDoctorCommand(options);
      }
    );
}

export async function executeDoctorCommand(
  options: { config?: string; sourceDir?: string; localesDir?: string } = {}
) {
  const config = await loadGlobalyzeConfig(options.config, buildOverrides(options));
  const report = await buildLocalizationDoctorReport(config);

  logger.heading("Localization Health Check");
  logger.info(`Total Keys: ${String(report.totalKeys)}`);
  logger.info(`Unused Keys: ${String(report.unusedKeys)}`);
  logger.info(`Duplicate Strings: ${String(report.duplicateStrings)}`);
  logger.info(`Coverage: ${String(report.coverage)}%`);
  logger.info(`Locked Keys Modified: ${String(report.lockedKeysModified)}`);
  logger.info(
    `Approval Required Changes: ${String(report.approvalRequiredChanges)}`
  );
  logger.info(`Locale Structure: ${report.localeStructureLabel}`);
  logger.info(`Languages: ${report.languages.join(", ")}`);

  return report;
}
