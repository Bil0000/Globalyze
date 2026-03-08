import { Command } from "commander";
import chalk from "chalk";

import { generateTranslationCoverageReport } from "../report/coverageReport";
import type {
  GlobalyzeConfig,
  LanguageCoverageReport,
  TranslationCoverageReport
} from "../types";
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

function formatLanguageName(
  report: TranslationCoverageReport,
  language: LanguageCoverageReport
): string {
  if (language.code === report.sourceLocale) {
    return "English";
  }

  return new Intl.DisplayNames(["en"], {
    type: "language"
  }).of(language.code) ?? language.code.toUpperCase();
}

function colorCoverage(coverage: number): string {
  const label = `${String(coverage)}%`;

  if (coverage >= 95) {
    return chalk.green(label);
  }

  if (coverage >= 80) {
    return chalk.yellow(label);
  }

  return chalk.red(label);
}

export async function executeReportCommand(
  options: {
    config?: string;
    sourceDir?: string;
    localesDir?: string;
  } = {}
): Promise<TranslationCoverageReport> {
  const config = await logger.step(
    "Loading configuration",
    () => loadGlobalyzeConfig(options.config, buildOverrides(options)),
    "Loaded configuration"
  );
  logger.hint("Press Ctrl+C at any time to stop Globalyze safely.");

  const report = await logger.step(
    "Generating translation coverage report",
    () => generateTranslationCoverageReport(config),
    "Generated translation coverage report"
  );

  logger.info("Globalyze Translation Report");
  logger.info(`Source locale: ${report.sourceLocale}`);
  logger.info(`Total keys: ${String(report.totalKeys)}`);
  console.log("");
  console.log(chalk.bold("Languages"));

  for (const language of report.languages) {
    const label = formatLanguageName(report, language).padEnd(10, " ");
    console.log(
      `${label} ${colorCoverage(language.coverage)} ${chalk.gray(
        `(${String(language.translatedKeys)}/${String(language.totalKeys)})`
      )}`
    );
  }

  const languagesWithMissingKeys = report.languages.filter(
    (language) =>
      language.code !== report.sourceLocale && language.missingKeys.length > 0
  );

  if (languagesWithMissingKeys.length > 0) {
    console.log("");
    console.log(chalk.bold("Missing Keys"));

    for (const language of languagesWithMissingKeys) {
      console.log("");
      console.log(chalk.yellow(formatLanguageName(report, language)));
      logger.list(language.missingKeys);
    }
  }

  return report;
}

export function registerReportCommand(program: Command): void {
  program
    .command("report")
    .description("Show localization statistics")
    .summary("Inspect translation coverage and missing keys")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
      }) => {
        await executeReportCommand(options);
      }
    );
}
