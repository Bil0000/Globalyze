import chalk from "chalk";
import { Command } from "commander";

import { generateProjectScore } from "../report/projectScore";
import type { GlobalyzeConfig } from "../types";
import { loadGlobalyzeConfig } from "../utils/fileUtils";
import { logger } from "../utils/logger";
import { logInterruptHint } from "../utils/progress";

function buildOverrides(options: {
  sourceDir?: string;
  localesDir?: string;
}): Partial<GlobalyzeConfig> {
  return {
    ...(options.sourceDir ? { sourceDir: options.sourceDir } : {}),
    ...(options.localesDir ? { localesDir: options.localesDir } : {})
  };
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

export function registerScoreCommand(program: Command): void {
  program
    .command("score")
    .description("Score the project's current internationalization quality")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
      }) => {
        await executeScoreCommand(options);
      }
    );
}

export async function executeScoreCommand(
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
  logInterruptHint();
  const score = await logger.step(
    "Calculating repository score",
    () => generateProjectScore(config),
    "Calculated repository score"
  );

  console.log(chalk.bold("🌍 Globalyze Project Score"));
  console.log(`Coverage: ${String(score.coverage)}%`);
  console.log(`Hardcoded strings: ${String(score.hardcodedStrings)}`);
  console.log(
    `Locales: ${score.healthyLocales ? chalk.green("healthy") : chalk.yellow("needs attention")}`
  );
  console.log(`Unused locale keys: ${String(score.unusedLocaleKeys)}`);
  console.log(`Score: ${colorGrade(score.grade)}`);

  return score;
}
