import path from "node:path";

import type {
  KeyAssignment,
  LocaleDictionary,
  LocaleKeyReference,
  LocaleSyncResult,
  MissingTranslationReport,
  ResolvedGlobalyzeConfig
} from "../types";
import {
  pathExists
} from "../utils/fileUtils";
import { GlobalyzeError } from "../utils/errors";
import { createLocaleWriter } from "./writers";

export function buildSourceLocale(
  assignments: readonly KeyAssignment[]
): LocaleDictionary {
  const locale: LocaleDictionary = {};

  for (const assignment of assignments) {
    locale[assignment.key] = assignment.text;
  }

  return locale;
}

export function getLocaleFilePath(
  config: ResolvedGlobalyzeConfig,
  language: string
): string {
  return path.join(
    config.localesDir,
    language,
    `${language}.${config.localeStructure.format}`
  );
}

export async function syncLocaleFiles(
  config: ResolvedGlobalyzeConfig,
  sourceLocale: LocaleDictionary,
  options: {
    preserveExistingOnEmpty?: boolean;
    sourceAssignments?: readonly LocaleKeyReference[];
  } = {}
): Promise<LocaleSyncResult> {
  const writer = createLocaleWriter(config);
  const preserveExistingOnEmpty = options.preserveExistingOnEmpty ?? true;
  const effectiveSourceLocale =
    Object.keys(sourceLocale).length > 0 || !preserveExistingOnEmpty
      ? sourceLocale
      : await readLocaleDictionary(config, config.sourceLocale);
  const created: string[] = [];
  const updated: string[] = [];
  const removed = await writer.removeStaleLanguages(config, config.languages);

  for (const language of config.languages) {
    const localePath = path.join(config.localesDir, language);
    const existed = await pathExists(localePath);
    const current = await readLocaleDictionary(config, language);
    const nextLocale: LocaleDictionary = {};

    for (const [key, englishValue] of Object.entries(effectiveSourceLocale)) {
      if (language === config.sourceLocale) {
        nextLocale[key] = englishValue;
        continue;
      }

      nextLocale[key] = current[key] ?? "";
    }

    await writer.writeLanguage(
      config,
      language,
      nextLocale,
      effectiveSourceLocale,
      options.sourceAssignments
    );

    if (existed) {
      updated.push(language);
    } else {
      created.push(language);
    }
  }

  return {
    created,
    updated,
    removed,
    sourceKeyCount: Object.keys(effectiveSourceLocale).length
  };
}

export async function readLocaleDictionary(
  config: ResolvedGlobalyzeConfig,
  language: string
): Promise<LocaleDictionary> {
  return createLocaleWriter(config).readLanguage(config, language);
}

export async function writeLocaleDictionary(
  config: ResolvedGlobalyzeConfig,
  language: string,
  locale: LocaleDictionary
): Promise<void> {
  const sourceLocale =
    language === config.sourceLocale
      ? locale
      : await readLocaleDictionary(config, config.sourceLocale);
  await createLocaleWriter(config).writeLanguage(
    config,
    language,
    locale,
    sourceLocale
  );
}

export async function mergeSourceLocaleDictionary(
  config: ResolvedGlobalyzeConfig,
  nextSourceLocale: LocaleDictionary
): Promise<LocaleDictionary> {
  const currentSourceLocale = await readLocaleDictionary(
    config,
    config.sourceLocale
  );

  return {
    ...currentSourceLocale,
    ...nextSourceLocale
  };
}

export async function reconcileSourceLocaleDictionary(
  config: ResolvedGlobalyzeConfig,
  nextSourceLocale: LocaleDictionary,
  activeKeys: readonly string[]
): Promise<LocaleDictionary> {
  const merged = await mergeSourceLocaleDictionary(config, nextSourceLocale);
  const activeKeySet = new Set(activeKeys);

  return Object.fromEntries(
    Object.entries(merged).filter(([key]) => activeKeySet.has(key))
  );
}

export async function ensureLocaleCoverageReady(
  config: ResolvedGlobalyzeConfig
): Promise<void> {
  if (!(await pathExists(config.localesDir))) {
    throw new GlobalyzeError(
      `Locales directory does not exist: ${config.localesDir}. Run "globalyze transform" or "globalyze run" first.`
    );
  }

  const sourceLocaleDirectory = path.join(config.localesDir, config.sourceLocale);
  const sourceLocalePath = getLocaleFilePath(config, config.sourceLocale);

  if (
    !(await pathExists(sourceLocaleDirectory)) &&
    !(await pathExists(sourceLocalePath))
  ) {
    throw new GlobalyzeError(
      `Source locale output does not exist for ${config.sourceLocale} in ${config.localesDir}. Run "globalyze transform" or "globalyze run" first.`
    );
  }

  const sourceLocale = await readLocaleDictionary(config, config.sourceLocale);

  if (Object.keys(sourceLocale).length === 0) {
    throw new GlobalyzeError(
      `Source locale output for ${config.sourceLocale} is empty in ${config.localesDir}. Run "globalyze transform" or "globalyze run" first.`
    );
  }
}

export async function findMissingTranslationKeys(
  config: ResolvedGlobalyzeConfig
): Promise<MissingTranslationReport> {
  await ensureLocaleCoverageReady(config);

  const sourceLocale = await readLocaleDictionary(config, config.sourceLocale);
  const sourceKeys = Object.keys(sourceLocale);
  const report: MissingTranslationReport = {};

  for (const language of config.languages) {
    if (language === config.sourceLocale) {
      continue;
    }

    const targetLocale = await readLocaleDictionary(config, language);
    const missing = sourceKeys.filter((key) => {
      const value = targetLocale[key];
      return typeof value !== "string" || value.trim().length === 0;
    });

    report[language] = missing;
  }

  return report;
}
