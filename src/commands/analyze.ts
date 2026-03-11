import chalk from "chalk";
import { Command } from "commander";

import { buildLocalizationDoctorReport } from "../inspection/translationInspector";
import { generateTranslationCoverageReport } from "../report/coverageReport";
import { generateProjectScore } from "../report/projectScore";
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

  return (
    new Intl.DisplayNames(["en"], {
      type: "language"
    }).of(language.code) ?? language.code.toUpperCase()
  );
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

function colorGrade(grade: "A" | "B" | "C" | "D"): string {
  if (grade === "A") {
    return chalk.green(grade);
  }

  if (grade === "B") {
    return chalk.yellow(grade);
  }

  return chalk.red(grade);
}

export function registerAnalyzeCommand(program: Command): void {
  program
    .command("analyze")
    .description("Show localization diagnostics in one command")
    .summary("Coverage, health, and project score")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
      }) => {
        await executeAnalyzeCommand(options);
      }
    );
}

export async function executeAnalyzeCommand(
  options: {
    config?: string;
    sourceDir?: string;
    localesDir?: string;
  } = {}
) {
  const config = await logger.step(
    "Loading configuration",
    () => loadGlobalyzeConfig(options.config, buildOverrides(options)),
    "Loaded configuration"
  );
  logger.hint("Press Ctrl+C at any time to stop Globalyze safely.");

  const [coverage, score, doctor] = await Promise.all([
    logger.step(
      "Generating translation coverage report",
      () => generateTranslationCoverageReport(config),
      "Generated translation coverage report"
    ),
    logger.step(
      "Calculating repository score",
      () => generateProjectScore(config),
      "Calculated repository score"
    ),
    logger.step(
      "Building localization health report",
      () => buildLocalizationDoctorReport(config),
      "Built localization health report"
    )
  ]);

  logger.heading("Globalyze Analysis");

  logger.newline();
  logger.heading("Coverage");
  logger.info(`Source locale: ${coverage.sourceLocale}`);
  logger.info(`Total keys: ${String(coverage.totalKeys)}`);

  for (const language of coverage.languages) {
    const label = formatLanguageName(coverage, language).padEnd(10, " ");
    console.log(
      `${label} ${colorCoverage(language.coverage)} ${chalk.gray(
        `(${String(language.translatedKeys)}/${String(language.totalKeys)})`
      )}`
    );
  }

  logger.newline();
  logger.heading("Project Score");
  logger.info(`Coverage: ${String(score.coverage)}%`);
  logger.info(`Hardcoded strings: ${String(score.hardcodedStrings)}`);
  logger.info(
    `Locales: ${score.healthyLocales ? chalk.green("healthy") : chalk.yellow("needs attention")}`
  );
  logger.info(`Unused locale keys: ${String(score.unusedLocaleKeys)}`);
  logger.info(`Score: ${colorGrade(score.grade)}`);

  logger.newline();
  logger.heading("Health");
  logger.info(`Total Keys: ${String(doctor.totalKeys)}`);
  logger.info(`Unused Keys: ${String(doctor.unusedKeys)}`);
  logger.info(`Duplicate Strings: ${String(doctor.duplicateStrings)}`);
  logger.info(`Coverage: ${String(doctor.coverage)}%`);
  logger.info(`Locked Keys Modified: ${String(doctor.lockedKeysModified)}`);
  logger.info(
    `Approval Required Changes: ${String(doctor.approvalRequiredChanges)}`
  );
  logger.info(`Locale Structure: ${doctor.localeStructureLabel}`);
  logger.info(`Languages: ${doctor.languages.join(", ")}`);

  const languagesWithMissingKeys = coverage.languages.filter(
    (language) =>
      language.code !== coverage.sourceLocale && language.missingKeys.length > 0
  );

  if (languagesWithMissingKeys.length > 0) {
    logger.newline();
    logger.heading("Missing Keys");

    for (const language of languagesWithMissingKeys) {
      logger.newline();
      console.log(chalk.yellow(formatLanguageName(coverage, language)));
      logger.list(language.missingKeys);
    }
  }

  return {
    coverage,
    score,
    doctor
  };
}
