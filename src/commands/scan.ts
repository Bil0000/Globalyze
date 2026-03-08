import { Command } from "commander";

import { collectProjectStrings } from "../cli/pipeline";
import { extractTranslationKeyReferencesFromFiles } from "../extractor/translationKeyExtractor";
import { updateTranslationGraph } from "../graph/translationGraph";
import type { GlobalyzeConfig } from "../types";
import { GlobalyzeError } from "../utils/errors";
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

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Scan the project and print hardcoded JSX strings")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .option("--json", "Print the scan result as JSON", false)
    .option(
      "--fail-on-findings",
      "Exit with a non-zero code if hardcoded strings are found",
      false
    )
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
        json?: boolean;
        failOnFindings?: boolean;
      }) => {
        await executeScanCommand(options);
      }
    );
}

export async function executeScanCommand(
  options: {
    config?: string;
    sourceDir?: string;
    localesDir?: string;
    json?: boolean;
    failOnFindings?: boolean;
  } = {}
) {
  const config = await logger.step(
    "Loading configuration",
    () => loadGlobalyzeConfig(options.config, buildOverrides(options)),
    "Loaded configuration"
  );
  logger.hint("Press Ctrl+C at any time to stop Globalyze safely.");
  const result = await logger.step(
    "Scanning source files and extracting UI strings",
    () => collectProjectStrings(config),
    (scanResult) =>
      `Scanned ${String(scanResult.files.length)} files and extracted ${String(scanResult.strings.length)} strings`
  );
  const references = await extractTranslationKeyReferencesFromFiles(
    result.files,
    config.translationFunctionName
  ).catch(() => []);
  if (references.length > 0) {
    await updateTranslationGraph(config, references);
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.strings.length > 0) {
    logger.list(
      result.strings.map(
        (item) => `${item.file}:${String(item.line)} "${item.text}"`
      )
    );
  }

  if (options.failOnFindings && result.strings.length > 0) {
    throw new GlobalyzeError(
      `Hardcoded UI strings detected (${String(result.strings.length)} total). Review the findings above and run "globalyze transform" to fix them.`
    );
  }

  return result;
}
