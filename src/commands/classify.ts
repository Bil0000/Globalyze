import path from "node:path";

import { cancel, isCancel, select } from "@clack/prompts";
import { Command } from "commander";

import { verifyOwnershipAssignments } from "../inspection/translationInspector";
import {
  readGlobalyzeProjectState,
  writeGlobalyzeProjectState
} from "../state/globalyzeState";
import type {
  GlobalyzeConfig,
  LocaleUnresolvedOwnershipStrategy,
  OwnershipVerificationEntry
} from "../types";
import { loadGlobalyzeConfig, toRelativePosixPath } from "../utils/fileUtils";
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

function formatEntry(entry: OwnershipVerificationEntry): string {
  const ownership =
    entry.pageName
      ? `page=${entry.pageName}`
      : entry.pageNames && entry.pageNames.length > 0
        ? `pages=${entry.pageNames.join(", ")}`
        : "page=unresolved";

  return `${entry.file} (${entry.componentName ?? "component"}, ${ownership})`;
}

function toDecisionFilePath(rootDir: string, filePath: string): string {
  return toRelativePosixPath(rootDir, path.resolve(rootDir, filePath));
}

async function promptUnresolvedDecision(
  entry: OwnershipVerificationEntry
): Promise<LocaleUnresolvedOwnershipStrategy | null> {
  const choice = await select({
    message: `How should ${entry.componentName ?? path.basename(entry.file)} be grouped?`,
    options: [
      {
        label: "Common file",
        value: "common",
        hint: "shared fallback"
      },
      {
        label: "Unresolved file",
        value: "file",
        hint: "separate unresolved bucket"
      },
      {
        label: "Standalone page file",
        value: "page",
        hint: "component-based page bucket"
      },
      {
        label: "Skip for now",
        value: "skip",
        hint: "leave unchanged"
      }
    ]
  });

  if (isCancel(choice)) {
    cancel("Classification update cancelled.");
    return null;
  }

  return choice === "skip"
    ? null
    : (choice as LocaleUnresolvedOwnershipStrategy);
}

async function applyUnresolvedFixes(
  rootDir: string,
  unresolved: readonly OwnershipVerificationEntry[],
  decisions?: Record<string, LocaleUnresolvedOwnershipStrategy>
): Promise<number> {
  if (unresolved.length === 0) {
    return 0;
  }

  const state = await readGlobalyzeProjectState(rootDir);
  const nextDecisions = {
    ...(state.unresolvedOwnership ?? {})
  };
  let applied = 0;

  for (const entry of unresolved) {
    const relativeFilePath = toDecisionFilePath(rootDir, entry.file);
    const configuredDecision =
      decisions?.[relativeFilePath] ??
      decisions?.[entry.file];
    const decision =
      configuredDecision ?? (await promptUnresolvedDecision(entry));

    if (!decision) {
      continue;
    }

    nextDecisions[relativeFilePath] = decision;
    applied += 1;
  }

  await writeGlobalyzeProjectState({
    ...state,
    projectRoot: rootDir,
    unresolvedOwnership: nextDecisions
  }, rootDir);

  return applied;
}

export function registerClassifyCommand(program: Command): void {
  program
    .command("classify")
    .description("Inspect ownership classification for per-page locale grouping")
    .summary("Inspect or fix route/component ownership classification")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .option("--fix", "Choose how unresolved files should be grouped")
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
        fix?: boolean;
      }) => {
        await executeClassifyCommand(options);
      }
    );
}

export async function executeClassifyCommand(
  options: {
    config?: string;
    sourceDir?: string;
    localesDir?: string;
    fix?: boolean;
    decisions?: Record<string, LocaleUnresolvedOwnershipStrategy>;
  } = {}
) {
  const config = await loadGlobalyzeConfig(options.config, buildOverrides(options));
  const report = await verifyOwnershipAssignments(config);

  logger.heading("Ownership Classification");
  logger.info(`Source Files: ${String(report.totalFiles)}`);
  logger.info(`Page Files: ${String(report.totalPages)}`);
  logger.info(`Component Files: ${String(report.totalComponents)}`);
  logger.info(`Route-owned: ${String(report.routeOwned.length)}`);
  logger.info(`Learned from existing state: ${String(report.learned.length)}`);
  logger.info(`Shared across routes: ${String(report.shared.length)}`);
  logger.info(`Unresolved: ${String(report.unresolved.length)}`);

  if (report.learned.length > 0) {
    logger.newline();
    logger.heading("Learned Ownership");
    logger.list(report.learned.map(formatEntry));
  }

  if (report.shared.length > 0) {
    logger.newline();
    logger.heading("Shared Components");
    logger.list(report.shared.map(formatEntry));
  }

  if (report.unresolved.length > 0) {
    logger.newline();
    logger.heading("Needs Review");
    logger.list(report.unresolved.map(formatEntry));
  } else {
    logger.newline();
    logger.success("No unresolved ownership assignments were found.");
  }

  if (options.fix) {
    logger.newline();
    const applied = await applyUnresolvedFixes(
      config.rootDir,
      report.unresolved,
      options.decisions
    );

    if (applied === 0) {
      logger.info("No ownership decisions were recorded.");
    } else {
      logger.success(`Saved ${String(applied)} ownership decisions.`);
      logger.info("Run `globalyze sync` or `globalyze style` to apply them.");
    }
  }

  return report;
}
