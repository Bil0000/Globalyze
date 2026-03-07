#!/usr/bin/env bun

import { CommanderError } from "commander";

import { runCLI } from "./cli";
import { installInterruptHandler } from "./utils/interrupt";
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
  installInterruptHandler();
  const version = await readVersion();
  await runCLI(version);
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
