import path from "node:path";

import type {
  KeyAssignment,
  LocaleDictionary,
  LocaleSyncResult,
  MissingTranslationReport,
  ResolvedGlobalyzeConfig
} from "../types";
import {
  pathExists,
  readJsonFile,
  writeJsonFile
} from "../utils/fileUtils";
import { GlobalyzeError } from "../utils/errors";

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
  return path.join(config.localesDir, `${language}.json`);
}

export async function syncLocaleFiles(
  config: ResolvedGlobalyzeConfig,
  sourceLocale: LocaleDictionary
): Promise<LocaleSyncResult> {
  const created: string[] = [];
  const updated: string[] = [];

  for (const language of config.languages) {
    const localePath = getLocaleFilePath(config, language);
    const existed = await pathExists(localePath);
    const current = (await readJsonFile(localePath)) ?? {};
    const nextLocale: LocaleDictionary = {};

    for (const [key, englishValue] of Object.entries(sourceLocale)) {
      if (language === config.sourceLocale) {
        nextLocale[key] = englishValue;
        continue;
      }

      nextLocale[key] = current[key] ?? "";
    }

    await writeJsonFile(localePath, nextLocale);

    if (existed) {
      updated.push(language);
    } else {
      created.push(language);
    }
  }

  return {
    created,
    updated
  };
}

export async function readLocaleDictionary(
  config: ResolvedGlobalyzeConfig,
  language: string
): Promise<LocaleDictionary> {
  return (await readJsonFile(getLocaleFilePath(config, language))) ?? {};
}

export async function writeLocaleDictionary(
  config: ResolvedGlobalyzeConfig,
  language: string,
  locale: LocaleDictionary
): Promise<void> {
  await writeJsonFile(getLocaleFilePath(config, language), locale);
}

export async function ensureLocaleCoverageReady(
  config: ResolvedGlobalyzeConfig
): Promise<void> {
  if (!(await pathExists(config.localesDir))) {
    throw new GlobalyzeError(
      `Locales directory does not exist: ${config.localesDir}. Run "globalyze transform" or "globalyze run" first.`
    );
  }

  const sourceLocalePath = getLocaleFilePath(config, config.sourceLocale);

  if (!(await pathExists(sourceLocalePath))) {
    throw new GlobalyzeError(
      `Source locale file does not exist: ${sourceLocalePath}. Run "globalyze transform" or "globalyze run" first.`
    );
  }

  const sourceLocale = await readLocaleDictionary(config, config.sourceLocale);

  if (Object.keys(sourceLocale).length === 0) {
    throw new GlobalyzeError(
      `Source locale file is empty: ${sourceLocalePath}. Run "globalyze transform" or "globalyze run" first.`
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
