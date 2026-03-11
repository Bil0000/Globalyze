import { spawn } from "node:child_process";
import path from "node:path";

import { Command } from "commander";
import fs from "fs-extra";

import { logger } from "../utils/logger";
import {
  checkForCliUpdates,
  getDefaultUpdateInstallSource,
  type UpdateCheckResult,
  writeCliUpdateState
} from "../update/versionCheck";
import { resolveGlobalyzeRootDir } from "../utils/fileUtils";

export interface CliUpdateCommandResult extends UpdateCheckResult {
  installSource: string;
  installMode: "global" | "linked";
}

function logReleaseInfo(result: UpdateCheckResult): void {
  if (!result.releaseInfo) {
    return;
  }

  if (result.releaseInfo.title) {
    logger.info(result.releaseInfo.title);
  }

  logger.list(result.releaseInfo.summaryLines);

  if (result.releaseInfo.url) {
    logger.info(`More details: ${result.releaseInfo.url}`);
  }
}

export async function readCurrentCliVersion(): Promise<string> {
  const packageJson = Bun.file(`${resolveGlobalyzeRootDir()}/package.json`);
  const parsed = (await packageJson.json()) as { version?: unknown };

  return typeof parsed.version === "string" && parsed.version.trim().length > 0
    ? parsed.version.trim()
    : "0.0.0";
}

export async function detectCliInstallMode(): Promise<"global" | "linked"> {
  const override = process.env.GLOBALYZE_CLI_INSTALL_MODE?.trim();
  if (override === "global" || override === "linked") {
    return override;
  }

  const rootDir = resolveGlobalyzeRootDir();
  return (await fs.pathExists(path.join(rootDir, ".git"))) ? "linked" : "global";
}

export function buildGlobalUpdateInvocation(
  installSource: string
): { command: string; args: string[]; displayCommand: string } {
  return {
    command: "bun",
    args: ["add", "-g", installSource],
    displayCommand: `bun add -g ${installSource}`
  };
}

async function runGlobalUpdateInstall(installSource: string): Promise<void> {
  const invocation = buildGlobalUpdateInvocation(installSource);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      stdio: "inherit",
      shell: false
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Global update failed with exit code ${String(code ?? "unknown")}.`
        )
      );
    });
  });
}

export async function executeUpdateCommand(
  currentVersion: string,
  options: {
    source?: string;
    checkOnly?: boolean;
  } = {}
): Promise<CliUpdateCommandResult> {
  const installSource = options.source?.trim() ?? getDefaultUpdateInstallSource();
  const installMode = await detectCliInstallMode();

  if (installMode === "linked") {
    const rootDir = resolveGlobalyzeRootDir();
    logger.warn("Globalyze is running from a linked local checkout.");
    logger.info(`Update the repo directly: git -C ${rootDir} pull`);
    logger.info(`Then refresh the linked CLI if needed: (cd ${rootDir} && bun link)`);

    return {
      checked: false,
      currentVersion,
      latestVersion: undefined,
      updateAvailable: false,
      installSource,
      installMode
    };
  }

  const check = await checkForCliUpdates(currentVersion, { force: true });

  if (options.checkOnly) {
    if (check.updateAvailable && check.latestVersion) {
      logger.warn(
        `A newer Globalyze CLI is available: ${currentVersion} -> ${check.latestVersion}`
      );
      logger.info(`Run \`globalyze update\` to install the latest version.`);
      logReleaseInfo(check);
    } else {
      logger.success(`Globalyze is up to date (${currentVersion}).`);
    }

    return {
      ...check,
      installSource,
      installMode
    };
  }

  logger.info(`Updating Globalyze from ${installSource}...`);
  await runGlobalUpdateInstall(installSource);

  if (check.latestVersion) {
    await writeCliUpdateState({
      lastCheckedAt: Date.now(),
      latestVersion: check.latestVersion
    });
  }

  logger.success(
    check.latestVersion
      ? `Globalyze update complete. Latest available version: ${check.latestVersion}`
      : "Globalyze update complete."
  );
  logReleaseInfo(check);

  return {
    ...check,
    installSource,
    installMode
  };
}

export function registerUpdateCommand(program: Command, currentVersion: string): void {
  program
    .command("update")
    .alias("upgrade")
    .description("Update the globally installed Globalyze CLI")
    .summary("Install the latest Globalyze release from GitHub")
    .option("--check", "Only check whether a newer CLI version is available")
    .option(
      "--source <source>",
      "Override the install source, e.g. github:Bil0000/Globalyze"
    )
    .action(async (options: { check?: boolean; source?: string }) => {
      await executeUpdateCommand(currentVersion, {
        checkOnly: options.check === true,
        source: options.source
      });
    });
}
