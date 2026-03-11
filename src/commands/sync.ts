import { Command } from "commander";

import { ensureLocalAdapterRuntime } from "../adapters/scaffold";
import { prepareTransformProject } from "../cli/pipeline";
import { extractTranslationKeyReferencesFromFiles } from "../extractor/translationKeyExtractor";
import { updateTranslationGraph } from "../graph/translationGraph";
import {
  readLocaleEntries,
  syncLocaleFiles
} from "../i18n/localeManager";
import { ensureLanguageArtifacts } from "../runtime/languageArtifacts";
import { translateLocales } from "../lingo/lingoClient";
import { refreshGeneratedTranslationManifests } from "../runtime/translationsManifest";
import { transformFiles } from "../transformer/astTransformer";
import type {
  GlobalyzeConfig,
  LocaleEntryDictionary,
  TranslationResult
} from "../types";
import { loadGlobalyzeConfig } from "../utils/fileUtils";
import { logger } from "../utils/logger";
import {
  logAnalysisHint,
  logFallbackReason,
  logInterruptHint,
  logReusedKeyCount,
  logTranslationHint
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
        ? `${result.action === "created" ? "Created" : "Updated"} translation runtime scaffold at ${result.path}`
        : "Translation runtime module is ready"
  );
  const refreshedLanguageArtifacts = await logger.step(
    "Ensuring locale runtime artifacts",
    () => ensureLanguageArtifacts(config),
    (result) => {
      const touched = [...result.created, ...result.updated];

      return touched.length > 0
        ? `Updated ${String(touched.length)} locale runtime artifact${touched.length === 1 ? "" : "s"}`
        : "Locale runtime artifacts are ready";
    }
  );
  logInterruptHint();
  logAnalysisHint();
  const prepared = await logger.step(
    "Scanning source files and planning translation changes",
    () => prepareTransformProject(config),
    (result) =>
      `Planned ${String(result.keyAssignments.length)} new translation keys from ${String(result.rawStrings.length)} UI strings`
  );
  logFallbackReason(prepared.fallbackReason);
  logReusedKeyCount(prepared.reusedExistingKeys);

  const currentSourceEntries = await readLocaleEntries(
    config,
    config.sourceLocale
  );
  const nextSourceLocale = prepared.sourceLocale;
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
  const references = await logger.step(
    "Refreshing translation graph",
    () =>
      extractTranslationKeyReferencesFromFiles(
        prepared.files,
        config.translationFunctionName
      ),
    (result) => `Mapped ${String(result.length)} translation key references`
  );
  await logger.step(
    "Updating translation graph",
    () => updateTranslationGraph(config, references),
    "Updated translation graph"
  );
  let translation: TranslationResult = {
    translatedLocales: [],
    usedMockTranslations: false,
    skippedReason: "No source locale keys exist yet."
  };

  if (localeSync.sourceKeyCount > 0) {
    logTranslationHint();
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

  const finalizedManifests = await logger.step(
    "Finalizing generated translation manifests",
    () => refreshGeneratedTranslationManifests(config),
    (paths) =>
      paths.length > 0
        ? `Finalized ${String(paths.length)} generated translation manifest${paths.length === 1 ? "" : "s"}`
        : "No generated translation manifests were found"
  );
  const refreshedRuntime = await logger.step(
    "Refreshing translation runtime module",
    () => ensureLocalAdapterRuntime(config),
    (result) =>
      result
        ? `${result.action === "created" ? "Created" : "Updated"} translation runtime scaffold at ${result.path}`
        : "Translation runtime module is already aligned"
  );

  if (translation.usedMockTranslations) {
    logger.warn(
      translation.skippedReason ??
        "English source values were copied to target locales."
    );
  }
  if (localeSync.removed.length > 0) {
    logger.info(`Removed stale locales: ${localeSync.removed.join(", ")}`);
  }
  if (finalizedManifests.length > 0) {
    logger.info(`Finalized: ${finalizedManifests.join(", ")}`);
  }
  const touchedArtifacts = [
    ...refreshedLanguageArtifacts.created,
    ...refreshedLanguageArtifacts.updated
  ];
  if (touchedArtifacts.length > 0) {
    logger.info(`Updated runtime artifacts: ${touchedArtifacts.join(", ")}`);
  }
  if (translation.skippedReason) {
    logger.info(translation.skippedReason);
  }

  const updatedFiles = transformedFiles.filter((item) => item.updated);
  const runtimeResult = refreshedRuntime ?? scaffoldedRuntime;
  if (runtimeResult) {
    logger.info(
      `${runtimeResult.action === "created" ? "Created" : "Updated"} ${runtimeResult.path} for ${config.translationImportPath}.`
    );
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
