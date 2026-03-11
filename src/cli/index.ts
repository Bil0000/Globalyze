import { buildProgram } from "./program";
import { launchInteractiveCLI } from "./interactive";
import { ensureGlobalyzeState } from "../state/globalyzeState";
import { logger } from "../utils/logger";
import { checkForCliUpdates } from "../update/versionCheck";
import { detectCliInstallMode } from "../commands/update";

async function maybeNotifyCliUpdate(version: string): Promise<void> {
  const commandName = process.argv[2];

  if (
    commandName === "update" ||
    commandName === "upgrade" ||
    commandName === "--help" ||
    commandName === "-h" ||
    commandName === "--version" ||
    commandName === "-V"
  ) {
    return;
  }

  try {
    if ((await detectCliInstallMode()) === "linked") {
      return;
    }

    const result = await checkForCliUpdates(version);

    if (result.updateAvailable && result.latestVersion) {
      logger.warn(
        `A newer Globalyze CLI is available: ${version} -> ${result.latestVersion}`
      );
      logger.info("Run `globalyze update` to install the latest version.");
      if (result.releaseInfo?.summaryLines.length) {
        logger.list(result.releaseInfo.summaryLines);
        if (result.releaseInfo.url) {
          logger.info(`Release notes: ${result.releaseInfo.url}`);
        }
      }
    }
  } catch {
    // Non-blocking by design: version checks should never prevent command execution.
  }
}

export async function runCLI(version: string): Promise<void> {
  if (process.argv.length <= 2) {
    await ensureGlobalyzeState();
    await maybeNotifyCliUpdate(version);
    await launchInteractiveCLI();
    return;
  }

  const program = buildProgram(version);
  program.hook("preAction", async () => {
    await ensureGlobalyzeState();
    await maybeNotifyCliUpdate(version);
  });
  await program.parseAsync(process.argv);
}
