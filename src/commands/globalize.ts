import path from "node:path";

import { Command } from "commander";

import { resolveI18nAdapter } from "../adapters";
import { executeSyncCommand } from "./sync";
import type { GlobalyzeConfig } from "../types";
import { loadGlobalyzeConfig, writeTextFile } from "../utils/fileUtils";
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

async function writeAdapterScaffold(
  config: Awaited<ReturnType<typeof loadGlobalyzeConfig>>
): Promise<string | null> {
  const adapter = resolveI18nAdapter(config);

  if (!adapter.canInjectProvider) {
    return null;
  }

  const scaffoldPath = path.join(config.rootDir, "globalyze.runtime.md");

  await writeTextFile(
    scaffoldPath,
    [
      `# Globalyze Runtime Integration`,
      ``,
      `Adapter: ${adapter.name}`,
      ``,
      `Globalyze updated source files to use \`${adapter.translationFunctionName}\`.`,
      `Wire the runtime provider manually if your app entrypoint is ambiguous.`,
      ``,
      adapter.providerComponentName && adapter.providerImportPath
        ? `Suggested provider: \`${adapter.providerComponentName}\` from \`${adapter.providerImportPath}\``
        : `No provider scaffold is available for this adapter.`,
      adapter.hookName
        ? `Suggested hook: \`${adapter.hookName}\` from \`${adapter.importPath ?? ""}\``
        : `No hook injection is required for this adapter.`,
      ""
    ].join("\n")
  );

  return scaffoldPath;
}

export function registerGlobalizeCommand(program: Command): void {
  program
    .command("globalize")
    .description("Migrate an existing project into an internationalized project")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
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

  const scaffoldPath = await logger.step(
    "Preparing runtime integration guidance",
    () => writeAdapterScaffold(config),
    (result) =>
      result ? `Generated runtime guidance at ${result}` : "No runtime scaffold was required"
  );

  if (adapter.canInjectProvider && scaffoldPath) {
    logger.warn(
      "Provider injection was left manual because the project entrypoint could not be identified confidently."
    );
  }

  return executeSyncCommand(options);
}
