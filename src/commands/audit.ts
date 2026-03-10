import { Command } from "commander";

import { collectProjectStrings } from "../cli/pipeline";
import type { ExtractedStringKind, GlobalyzeConfig } from "../types";
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

interface AuditSummary {
  totalFiles: number;
  totalFindings: number;
  kindCounts: Record<ExtractedStringKind, number>;
  fileCounts: Record<string, number>;
}

function buildAuditSummary(result: Awaited<ReturnType<typeof collectProjectStrings>>): AuditSummary {
  const kindCounts: Record<ExtractedStringKind, number> = {
    "jsx-text": 0,
    "jsx-expression-string": 0,
    "jsx-attribute": 0,
    "object-property": 0,
    "jsx-dynamic": 0
  };
  const fileCounts: Record<string, number> = {};

  for (const item of result.strings) {
    kindCounts[item.kind] += 1;
    fileCounts[item.file] = (fileCounts[item.file] ?? 0) + 1;
  }

  return {
    totalFiles: result.files.length,
    totalFindings: result.strings.length,
    kindCounts,
    fileCounts
  };
}

export function registerAuditCommand(program: Command): void {
  program
    .command("audit")
    .description("Audit the project for remaining extractable UI strings")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .option("--json", "Print the audit result as JSON", false)
    .option(
      "--fail-on-findings",
      "Exit with a non-zero code if any remaining strings are found",
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
        await executeAuditCommand(options);
      }
    );
}

export async function executeAuditCommand(
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
    "Auditing source files for remaining UI strings",
    () => collectProjectStrings(config),
    (scanResult) =>
      `Scanned ${String(scanResult.files.length)} files and found ${String(scanResult.strings.length)} remaining strings`
  );
  const summary = buildAuditSummary(result);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ...result,
          summary
        },
        null,
        2
      )
    );
  } else {
    logger.success("Extraction Audit");
    logger.info(`Source Files: ${String(summary.totalFiles)}`);
    logger.info(`Remaining UI Strings: ${String(summary.totalFindings)}`);
    logger.info(
      `Kinds: jsx-text=${String(summary.kindCounts["jsx-text"])}, jsx-attribute=${String(summary.kindCounts["jsx-attribute"])}, object-property=${String(summary.kindCounts["object-property"])}, jsx-expression-string=${String(summary.kindCounts["jsx-expression-string"])}, jsx-dynamic=${String(summary.kindCounts["jsx-dynamic"])}`
    );

    const topFiles = Object.entries(summary.fileCounts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 10);

    if (topFiles.length > 0) {
      logger.info("Top Files:");
      logger.list(topFiles.map(([file, count]) => `${file} (${String(count)})`));
    }

    if (result.strings.length > 0) {
      logger.info("Findings:");
      logger.list(
        result.strings.slice(0, 50).map((item) => {
          const detail = item.attributeName
            ? ` [attr:${item.attributeName}]`
            : item.propertyName
              ? ` [prop:${item.propertyName}]`
              : "";

          return `${item.file}:${String(item.line)}${detail} "${item.text}"`;
        })
      );
    }
  }

  if (options.failOnFindings && summary.totalFindings > 0) {
    throw new GlobalyzeError(
      `Remaining extractable UI strings detected (${String(summary.totalFindings)} total). Review the audit findings above and rerun Globalyze after addressing them.`
    );
  }

  return {
    ...result,
    summary
  };
}
