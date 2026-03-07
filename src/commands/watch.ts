import { Command } from "commander";

import { collectProjectStrings } from "../cli/pipeline";
import { createProjectWatcher, processWatchUpdate } from "../watch/watchMode";
import type { ExtractedString, GlobalyzeConfig } from "../types";
import { loadGlobalyzeConfig } from "../utils/fileUtils";
import { logger } from "../utils/logger";
import {
  logFallbackReason,
  logInterruptHint,
  logReusedKeyCount
} from "../utils/progress";

function buildOverrides(options: {
  sourceDir?: string;
  localesDir?: string;
}): Partial<GlobalyzeConfig> {
  return {
    ...(options.sourceDir ? { sourceDir: options.sourceDir } : {}),
    ...(options.localesDir ? { localesDir: options.localesDir } : {})
  };
}

export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("Watch the project and update locales when new strings appear")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
      }) => {
        await executeWatchCommand(options);
      }
    );
}

function logNewStrings(newStrings: readonly ExtractedString[]): void {
  if (newStrings.length === 0) {
    logger.info("No new UI strings detected in this update.");
    return;
  }

  logger.info("Detected new UI strings:");
  logger.list(newStrings.map((item) => `${item.file}:${String(item.line)} "${item.text}"`));
}

export async function executeWatchCommand(
  options: {
    config?: string;
    sourceDir?: string;
    localesDir?: string;
  } = {}
): Promise<void> {
  const config = await logger.step(
    "Loading configuration",
    () => loadGlobalyzeConfig(options.config, buildOverrides(options)),
    "Loaded configuration"
  );
  logInterruptHint();
  const initialScan = await logger.step(
    "Building initial project snapshot",
    () => collectProjectStrings(config),
    (result) => `Indexed ${String(result.strings.length)} UI strings`
  );
  let previousStrings = initialScan.strings;
  let runQueued = false;
  let runInFlight = false;

  const runUpdate = async () => {
    if (runInFlight) {
      runQueued = true;
      return;
    }

    runInFlight = true;

    try {
      const update = await logger.step(
        "Processing source changes",
        () => processWatchUpdate(config, previousStrings),
        (result) =>
          `Updated ${String(result.updatedFiles.length)} files, synced locales${
            result.translation
              ? `, and translated ${String(result.translation.translatedLocales.length)} languages`
              : ""
          }`
      );
      logFallbackReason(update.fallbackReason);
      logReusedKeyCount(update.reusedExistingKeys);
      if (update.translation?.usedMockTranslations) {
        logger.warn(
          update.translation.skippedReason ??
            "English source values were copied to target locales."
        );
      }
      if (update.translation?.skippedReason) {
        logger.info(update.translation.skippedReason);
      }
      logNewStrings(update.newStrings);

      const refreshed = await collectProjectStrings(config);
      previousStrings = refreshed.strings;
    } finally {
      runInFlight = false;

      if (runQueued) {
        runQueued = false;
        await runUpdate();
      }
    }
  };

  const watcher = createProjectWatcher(config, () => {
    void runUpdate();
  });

  logger.success("Watching project for UI strings...");

  await new Promise<void>((resolve, reject) => {
    watcher.on("error", reject);
    process.on("SIGINT", () => {
      void watcher.close().finally(resolve);
    });
    process.on("SIGTERM", () => {
      void watcher.close().finally(resolve);
    });
  });
}
