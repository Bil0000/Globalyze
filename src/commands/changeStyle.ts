import path from "node:path";

import { Command } from "commander";

import { promptLocaleStructure } from "./init";
import { extractTranslationKeyReferencesFromFiles } from "../extractor/translationKeyExtractor";
import {
  readLocaleEntries,
  writeLocaleEntries
} from "../i18n/localeManager";
import { refreshGeneratedTranslationManifests } from "../runtime/translationsManifest";
import { scanProjectFiles } from "../scanner/projectScanner";
import type {
  LocaleEntryDictionary,
  LocaleStructureConfig
} from "../types";
import { createConfigContents, loadGlobalyzeConfig, writeTextFile } from "../utils/fileUtils";
import { logger } from "../utils/logger";

function resolveConfigPath(configPath?: string): string {
  return path.resolve(process.cwd(), configPath ?? "globalyze.config.ts");
}

export function registerChangeStyleCommand(program: Command): void {
  program
    .command("style")
    .description("Change the locale file storage style without regenerating keys")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .action(async (options: { config?: string }) => {
      await executeChangeStyleCommand(options);
    });
}

export async function executeChangeStyleCommand(
  options: {
    config?: string;
    localeStructure?: LocaleStructureConfig;
  } = {}
): Promise<void> {
  const config = await logger.step(
    "Loading configuration",
    () => loadGlobalyzeConfig(options.config),
    "Loaded configuration"
  );
  const localeEntriesByLanguage = await logger.step<
    Record<string, LocaleEntryDictionary>
  >(
    "Reading existing locale data",
    async () => {
      const entries = await Promise.all(
        config.languages.map(async (language) => {
          const localeEntries = await readLocaleEntries(config, language);
          return [language, localeEntries] as const;
        })
      );

      return Object.fromEntries(entries) as Record<string, LocaleEntryDictionary>;
    },
    (entries) =>
      `Loaded ${String(
        Object.keys(entries[config.sourceLocale] ?? {}).length
      )} source locale keys`
  );
  const nextLocaleStructure =
    options.localeStructure ?? (await promptLocaleStructure());
  const nextConfig = {
    ...config,
    localeStructure: nextLocaleStructure
  };
  const configPath = resolveConfigPath(options.config);

  await logger.step(
    "Updating config file",
    () => writeTextFile(configPath, createConfigContents(nextConfig)),
    () => `Updated ${configPath}`
  );
  const sourceFiles = await logger.step(
    "Inspecting source file metadata",
    () => scanProjectFiles(nextConfig),
    (files) => `Indexed ${String(files.length)} source files`
  );
  const sourceAssignments = await logger.step(
    "Collecting translation key locations",
    () =>
      extractTranslationKeyReferencesFromFiles(
        sourceFiles,
        nextConfig.translationFunctionName
      ),
    (references) => `Mapped ${String(references.length)} key references`
  );
  const localeSync = await logger.step(
    "Rewriting locale files",
    async () => {
      const sourceEntries =
        localeEntriesByLanguage[nextConfig.sourceLocale] ?? {};

      await writeLocaleEntries(
        nextConfig,
        nextConfig.sourceLocale,
        sourceEntries,
        sourceAssignments
      );

      for (const language of nextConfig.languages) {
        if (language === nextConfig.sourceLocale) {
          continue;
        }

        await writeLocaleEntries(
          nextConfig,
          language,
          localeEntriesByLanguage[language] ?? {},
          sourceAssignments
        );
      }

      return {
        created: nextConfig.languages,
        updated: nextConfig.languages,
        removed: [],
        sourceKeyCount: Object.keys(sourceEntries).length
      };
    },
    () => `Regenerated locale files in ${nextConfig.localesDir}`
  );
  const refreshedManifests = await logger.step(
    "Refreshing generated translation manifests",
    () => refreshGeneratedTranslationManifests(nextConfig),
    (paths) =>
      paths.length > 0
        ? `Updated ${String(paths.length)} generated translation manifest${paths.length === 1 ? "" : "s"}`
        : "No generated translation manifests were found"
  );

  if (localeSync.removed.length > 0) {
    logger.info(`Removed stale locales: ${localeSync.removed.join(", ")}`);
  }
  if (refreshedManifests.length > 0) {
    logger.info(`Refreshed: ${refreshedManifests.join(", ")}`);
  }

  logger.success("Locale file style updated.");
}
