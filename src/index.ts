#!/usr/bin/env bun

import { CommanderError } from "commander";

import { buildProgram } from "./cli/program";
import { GlobalyzeError, toErrorMessage } from "./utils/errors";
import { logger } from "./utils/logger";

async function readVersion(): Promise<string> {
  const packageJson = (await Bun.file(
    new URL("../package.json", import.meta.url)
  ).json()) as {
    version?: string;
  };

  return packageJson.version ?? "0.0.0";
}

async function main(): Promise<void> {
  const version = await readVersion();
  const program = buildProgram(version);
  await program.parseAsync(process.argv);
}

try {
  await main();
} catch (error) {
  if (error instanceof CommanderError) {
    logger.error(error.message);
    process.exit(error.exitCode);
  }

  if (error instanceof GlobalyzeError) {
    logger.error(error.message);
    process.exit(error.exitCode);
  }

  logger.error(toErrorMessage(error));
  process.exit(1);
}
