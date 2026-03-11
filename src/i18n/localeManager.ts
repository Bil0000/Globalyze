import path from "node:path";

import type {
  KeyAssignment,
  LocaleDictionary,
  LocaleEntryDictionary,
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

function formatNumericKeySegment(segment: string): string | null {
  const parts = segment.split("_").filter(Boolean);

  if (parts.length === 0 || !parts.every((part) => /^\d+$/.test(part))) {
    return null;
  }

  const [whole, fractional, decimal] = parts;

  if (
    whole &&
    fractional &&
    decimal &&
    fractional.length === 3 &&
    decimal.length === 2
  ) {
    return `${whole},${fractional}.${decimal}`;
  }

  if (whole && fractional && parts.length === 2 && fractional.length === 1) {
    return `${whole}.${fractional}`;
  }

  if (whole && fractional && parts.length === 2 && fractional.length === 2) {
    return `${whole}.${fractional}`;
  }

  return parts.join(" ");
}

const UPPERCASE_TOKENS = new Set([
  "api",
  "crm",
  "ui",
  "ux",
  "id",
  "url",
  "seo",
  "saas",
  "sms",
  "otp",
  "kpi"
]);

const LOWERCASE_TITLE_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "up",
  "with"
]);

function toSentenceCase(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return trimmed;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function toTitleCase(value: string): string {
  const words = value.split(/\s+/).filter(Boolean);

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();

      if (UPPERCASE_TOKENS.has(lower)) {
        return lower.toUpperCase();
      }

      if (index > 0 && LOWERCASE_TITLE_WORDS.has(lower)) {
        return lower;
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function inferSourceTextFromKey(key: string): string {
  const segments = key.split(".").filter(Boolean);
  const rawSegment = segments.at(-1) ?? key;
  const numeric = formatNumericKeySegment(rawSegment);

  if (numeric) {
    return numeric;
  }

  const normalized = rawSegment
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length === 0) {
    return key;
  }

  const lowerKey = key.toLowerCase();
  const isSentenceLike =
    lowerKey.includes("description") ||
    lowerKey.includes("subtitle") ||
    lowerKey.includes("message") ||
    lowerKey.includes("caption") ||
    lowerKey.includes("helper") ||
    lowerKey.includes("hint") ||
    lowerKey.includes("tooltip") ||
    lowerKey.includes(".div.") ||
    lowerKey.includes(".span.") ||
    lowerKey.includes(".p.");

  return isSentenceLike
    ? toSentenceCase(normalized)
    : toTitleCase(normalized);
}

export function buildSourceLocaleFromReferences(
  existingSourceLocale: LocaleDictionary,
  keyAssignments: readonly KeyAssignment[],
  sourceAssignments: readonly LocaleKeyReference[]
): { locale: LocaleDictionary; recoveredCount: number } {
  const nextSourceLocale: LocaleDictionary = {};
  const recovered = new Set<string>();
  const assignedByKey = new Map(
    keyAssignments.map((assignment) => [assignment.key, assignment.text] as const)
  );
  const activeKeys = new Set<string>([
    ...sourceAssignments.map((assignment) => assignment.key),
    ...keyAssignments.map((assignment) => assignment.key)
  ]);

  for (const key of activeKeys) {
    const assignedText = assignedByKey.get(key);

    if (assignedText) {
      nextSourceLocale[key] = assignedText;
      continue;
    }

    const existingValue = existingSourceLocale[key];

    if (typeof existingValue === "string" && existingValue.trim().length > 0) {
      nextSourceLocale[key] = existingValue;
      continue;
    }

    nextSourceLocale[key] = inferSourceTextFromKey(key);
    recovered.add(key);
  }

  return {
    locale: nextSourceLocale,
    recoveredCount: recovered.size
  };
}

function mergeMetadata(
  current: LocaleEntryDictionary,
  nextValues: LocaleDictionary
): LocaleEntryDictionary {
  return Object.fromEntries(
    Object.entries(nextValues).map(([key, value]) => [
      key,
      {
        ...(current[key] ?? {}),
        value
      }
    ])
  );
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
    const currentEntries = await readLocaleEntries(config, language);
    const nextLocale: LocaleDictionary = {};

    for (const [key, englishValue] of Object.entries(effectiveSourceLocale)) {
      if (language === config.sourceLocale) {
        nextLocale[key] = englishValue;
        continue;
      }

      nextLocale[key] = current[key] ?? "";
    }

    await writer.writeLanguageEntries(
      config,
      language,
      mergeMetadata(currentEntries, nextLocale),
      mergeMetadata(
        language === config.sourceLocale ? currentEntries : await readLocaleEntries(config, config.sourceLocale),
        effectiveSourceLocale
      ),
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

export async function readLocaleEntries(
  config: ResolvedGlobalyzeConfig,
  language: string
): Promise<LocaleEntryDictionary> {
  return createLocaleWriter(config).readLanguageEntries(config, language);
}

export async function writeLocaleDictionary(
  config: ResolvedGlobalyzeConfig,
  language: string,
  locale: LocaleDictionary,
  sourceAssignments?: readonly LocaleKeyReference[]
): Promise<void> {
  const sourceLocale =
    language === config.sourceLocale
      ? locale
      : await readLocaleDictionary(config, config.sourceLocale);
  const currentEntries = await readLocaleEntries(config, language);
  const sourceEntries = mergeMetadata(
    language === config.sourceLocale
      ? currentEntries
      : await readLocaleEntries(config, config.sourceLocale),
    sourceLocale
  );
  await createLocaleWriter(config).writeLanguageEntries(
    config,
    language,
    mergeMetadata(currentEntries, locale),
    sourceEntries,
    sourceAssignments
  );
}

export async function writeLocaleEntries(
  config: ResolvedGlobalyzeConfig,
  language: string,
  locale: LocaleEntryDictionary,
  sourceAssignments?: readonly LocaleKeyReference[]
): Promise<void> {
  const sourceEntries =
    language === config.sourceLocale
      ? locale
      : await readLocaleEntries(config, config.sourceLocale);
  await createLocaleWriter(config).writeLanguageEntries(
    config,
    language,
    locale,
    sourceEntries,
    sourceAssignments
  );
}

export async function updateTranslationMetadata(
  config: ResolvedGlobalyzeConfig,
  key: string,
  updates: {
    owner?: string;
    locked?: boolean;
    approvalRequired?: boolean;
  }
): Promise<void> {
  for (const language of config.languages) {
    const entries = await readLocaleEntries(config, language);
    const entry = entries[key];

    if (!entry) {
      continue;
    }

    entries[key] = {
      ...entry,
      ...(updates.owner !== undefined ? { owner: updates.owner } : {}),
      ...(updates.locked !== undefined ? { locked: updates.locked } : {}),
      ...(updates.approvalRequired !== undefined
        ? { approvalRequired: updates.approvalRequired }
        : {})
    };

    await writeLocaleEntries(config, language, entries);
  }
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
        .replace('"globalyze run"', '"globalyze sync"')
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
        .replace('"globalyze run"', '"globalyze sync"')
    );
  }

  const sourceLocale = await readLocaleDictionary(config, config.sourceLocale);

  if (Object.keys(sourceLocale).length === 0) {
    throw new GlobalyzeError(
      `Source locale output for ${config.sourceLocale} is empty in ${config.localesDir}. Run "globalyze transform" or "globalyze run" first.`
        .replace('"globalyze run"', '"globalyze sync"')
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
