import path from "node:path";

import { Command } from "commander";
import { confirm, isCancel } from "@clack/prompts";

import { resolveI18nAdapter } from "../adapters";
import {
  inspectRuntimeProviderTarget,
  setupRuntimeProvider
} from "../runtime/providerWiring";
import { executeSyncCommand } from "./sync";
import type { GlobalyzeConfig } from "../types";
import { GlobalyzeError } from "../utils/errors";
import { loadGlobalyzeConfig } from "../utils/fileUtils";
import { logger } from "../utils/logger";
import { detectPackageManager } from "../utils/packageManager";
import { logMigrationHint } from "../utils/progress";

function buildOverrides(options: {
  sourceDir?: string;
  localesDir?: string;
}): Partial<GlobalyzeConfig> {
  return {
    ...(options.sourceDir ? { sourceDir: options.sourceDir } : {}),
    ...(options.localesDir ? { localesDir: options.localesDir } : {})
  };
}

async function maybeWireRuntimeDuringGlobalize(
  config: Awaited<ReturnType<typeof loadGlobalyzeConfig>>
): Promise<void> {
  const packageManager = await detectPackageManager(config.rootDir);
  let confirmWiring: boolean | undefined;

  if (process.stdin.isTTY && process.stdout.isTTY) {
    const preview = await inspectRuntimeProviderTarget(config);

    if (preview.alreadyWired) {
      logger.info(preview.skippedReason ?? "Runtime provider is already wired.");
      return;
    }

    if (preview.canAutoWire) {
      const decision = await confirm({
        message: `Globalyze can automatically wire the runtime provider.\n\nDetected framework: ${preview.framework}\nEntry file: ${preview.entryFile ? path.relative(config.rootDir, preview.entryFile) : "not detected"}\n\nProceed?`,
        initialValue: true
      });

      if (isCancel(decision)) {
        throw new GlobalyzeError("Runtime provider setup was cancelled.");
      }

      confirmWiring = decision;
    }
  } else {
    confirmWiring = false;
  }

  const result = await setupRuntimeProvider(config, packageManager, {
    confirmWiring
  });

  if (result.alreadyWired && result.entryFile) {
    logger.info(result.skippedReason ?? "Runtime provider is already wired.");
  } else if (result.wired && result.entryFile) {
    logger.success(`Wired runtime provider in ${result.entryFile}`);
  } else if (result.guidancePath) {
    logger.warn(result.skippedReason ?? "Automatic runtime wiring was skipped.");
    logger.info(`Generated runtime guidance at ${result.guidancePath}`);
  }

  if (result.languageSwitcherPath) {
    logger.success("Language switcher generated");
    logger.info(
      'Import the switcher anywhere in your UI:\nimport { GlobalyzeLanguageSwitcher } from "@/components/GlobalyzeLanguageSwitcher"'
    );
  }
  if (result.devSwitcherInjected) {
    logger.success("Dev language switcher enabled");
  }
}

export function registerGlobalizeCommand(program: Command): void {
  program
    .command("globalize")
    .description("Convert a project to use internationalization")
    .summary("Run the one-time migration workflow")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .addHelpText(
      "after",
      [
        "",
        "Actions performed:",
        "- scan source files",
        "- extract hardcoded UI strings",
        "- generate semantic keys",
        "- transform JSX source",
        "- sync locale files",
        "- translate initial locale entries",
        "- generate adapter guidance when runtime injection is ambiguous",
        ""
      ].join("\n")
    )
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
      }) => {
        await executeGlobalizeCommand(options);
      }
    );
}

export async function executeGlobalizeCommand(
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
  const adapter = resolveI18nAdapter(config);
  logger.info(`Using ${adapter.name} adapter for migration.`);
  logMigrationHint();

  await logger.step(
    "Preparing runtime integration",
    () => maybeWireRuntimeDuringGlobalize(config),
    "Runtime integration prepared"
  );

  const result = await executeSyncCommand(options);
  logger.newline();
  logger.heading("Globalyze Migration Complete");
  logger.info("Project globalization setup finished.");
  return result;
}
