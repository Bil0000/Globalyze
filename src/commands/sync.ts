import { Command } from "commander";

import { ensureLocalAdapterRuntime } from "../adapters/scaffold";
import { prepareTransformProject } from "../cli/pipeline";
import { extractTranslationKeyReferencesFromFiles } from "../extractor/translationKeyExtractor";
import { updateTranslationGraph } from "../graph/translationGraph";
import {
  buildSourceLocale,
  readLocaleEntries,
  syncLocaleFiles
} from "../i18n/localeManager";
import { translateLocales } from "../lingo/lingoClient";
import { transformFiles } from "../transformer/astTransformer";
import type {
  GlobalyzeConfig,
  LocaleEntryDictionary,
  TranslationResult
} from "../types";
import { loadGlobalyzeConfig } from "../utils/fileUtils";
import { logger } from "../utils/logger";
import {
  logFallbackReason,
  logInterruptHint,
  logReusedKeyCount
} from "../utils/progress";
import {
  assertGovernanceAllowsChanges,
  evaluateTranslationGovernance
} from "../governance/translationGovernance";

function buildOverrides(options: {
  sourceDir?: string;
  localesDir?: string;
}): Partial<GlobalyzeConfig> {
  return {
    ...(options.sourceDir ? { sourceDir: options.sourceDir } : {}),
    ...(options.localesDir ? { localesDir: options.localesDir } : {})
  };
}

function toGovernedEntries(
  currentEntries: LocaleEntryDictionary,
  sourceLocale: Record<string, string>
): LocaleEntryDictionary {
  return Object.fromEntries(
    Object.entries(sourceLocale).map(([key, value]) => [
      key,
      {
        ...(currentEntries[key] ?? {}),
        value
      }
    ])
  );
}

function logGovernanceReview(
  governanceEnabled: boolean,
  evaluation: ReturnType<typeof evaluateTranslationGovernance>
): void {
  if (!governanceEnabled) {
    return;
  }

  if (evaluation.changedKeys.length === 0) {
    return;
  }

  logger.info("Localization Governance Review");
  logger.info(`Changed Keys: ${String(evaluation.changedKeys.length)}`);

  if (evaluation.lockedViolations.length > 0) {
    logger.error(
      `Locked Keys Modified: ${String(evaluation.lockedViolations.length)}`
    );
    logger.list(
      evaluation.lockedViolations.map((item) => `${item.key} is locked`)
    );
  }

  if (evaluation.approvalRequiredChanges.length > 0) {
    logger.warn(
      `Approval Required: ${String(evaluation.approvalRequiredChanges.length)}`
    );
    logger.list(
      evaluation.approvalRequiredChanges.map(
        (item) => `${item.key} requires approval`
      )
    );
  }

  if (evaluation.ownedChanges.length > 0) {
    logger.warn(
      `Owned Keys Changed: ${String(evaluation.ownedChanges.length)}`
    );
    logger.list(
      evaluation.ownedChanges.map(
        (item) => `${item.key} is owned by ${item.owner ?? "unknown"}`
      )
    );
  }
}

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Synchronize translations with the codebase")
    .summary("Update translations and locale files")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .addHelpText(
      "after",
      [
        "",
        "Actions performed:",
        "- scan source files",
        "- extract new UI strings",
        "- update locale files",
        "- translate new keys",
        "- update translation graph",
        "- run governance validation",
        ""
      ].join("\n")
    )
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
      }) => {
        await executeSyncCommand(options);
      }
    );
}

export async function executeSyncCommand(
  options: {
    config?: string;
    sourceDir?: string;
    localesDir?: string;
    suppressAliasWarning?: boolean;
  } = {}
) {
  const config = await logger.step(
    "Loading configuration",
    () => loadGlobalyzeConfig(options.config, buildOverrides(options)),
    "Loaded configuration"
  );
  const scaffoldedRuntime = await logger.step(
    "Ensuring translation runtime module",
    () => ensureLocalAdapterRuntime(config),
    (result) =>
      result
        ? `Created translation runtime scaffold at ${result}`
        : "Translation runtime module is ready"
  );
  logInterruptHint();
  const prepared = await logger.step(
    "Preparing translation sync",
    () => prepareTransformProject(config),
    (result) =>
      `Prepared ${String(result.keyAssignments.length)} translation keys from ${String(result.rawStrings.length)} UI strings`
  );
  logFallbackReason(prepared.fallbackReason);
  logReusedKeyCount(prepared.reusedExistingKeys);

  const currentSourceEntries = await readLocaleEntries(
    config,
    config.sourceLocale
  );
  const nextSourceLocale = buildSourceLocale(prepared.keyAssignments);
  const nextSourceEntries = toGovernedEntries(currentSourceEntries, nextSourceLocale);
  const governance = evaluateTranslationGovernance(
    currentSourceEntries,
    nextSourceEntries
  );
  logGovernanceReview(config.governance.enabled, governance);
  assertGovernanceAllowsChanges(config, governance);

  const transformedFiles = await logger.step(
    "Transforming source files",
    () => transformFiles(prepared.files, prepared.keysByText, config),
    (results) =>
      `Transformed ${String(results.filter((item) => item.updated).length)} files`
  );
  const localeSync = await logger.step(
    "Syncing locale files",
    () =>
      syncLocaleFiles(config, nextSourceLocale, {
        sourceAssignments: prepared.sourceAssignments
      }),
    () => `Updated locale files in ${config.localesDir}`
  );
  const references = await extractTranslationKeyReferencesFromFiles(
    prepared.files,
    config.translationFunctionName
  );
  await updateTranslationGraph(config, references);
  let translation: TranslationResult = {
    translatedLocales: [],
    usedMockTranslations: false,
    skippedReason: "No source locale keys exist yet."
  };

  if (localeSync.sourceKeyCount > 0) {
    translation = await logger.step(
      "Translating locale files",
      () => translateLocales(config),
      (result) =>
        `Translated ${String(result.translatedLocales.length)} languages${
          result.usedMockTranslations ? " using English fallback values" : ""
        }`
    );
  } else {
    logger.warn("Skipping translation because no source locale keys exist yet.");
  }

  if (translation.usedMockTranslations) {
    logger.warn(
      translation.skippedReason ??
        "English source values were copied to target locales."
    );
  }
  if (localeSync.removed.length > 0) {
    logger.info(`Removed stale locales: ${localeSync.removed.join(", ")}`);
  }
  if (translation.skippedReason) {
    logger.info(translation.skippedReason);
  }

  const updatedFiles = transformedFiles.filter((item) => item.updated);
  if (scaffoldedRuntime) {
    logger.info(`Created ${scaffoldedRuntime} for ${config.translationImportPath}.`);
  }
  logger.newline();
  logger.heading("Globalyze Sync Complete");
  logger.info(`Updated Files: ${String(updatedFiles.length)}`);
  logger.info(`Source Keys: ${String(localeSync.sourceKeyCount)}`);
  logger.info(
    `Locale Files Updated: ${localeSync.created.length > 0 || localeSync.updated.length > 0 ? "yes" : "no"}`
  );
  logger.info(
    `Governance Checks: ${config.governance.enabled ? "enabled" : "disabled"}`
  );

  return {
    transformedFiles,
    localeSync,
    translation,
    governance
  };
}
