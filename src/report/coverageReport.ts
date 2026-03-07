import type {
  LanguageCoverageReport,
  ResolvedGlobalyzeConfig,
  TranslationCoverageReport
} from "../types";
import {
  ensureLocaleCoverageReady,
  readLocaleDictionary
} from "../i18n/localeManager";

function calculateCoverage(
  translatedKeys: number,
  totalKeys: number
): number {
  if (totalKeys === 0) {
    return 100;
  }

  return Math.round((translatedKeys / totalKeys) * 100);
}

function buildLanguageCoverage(
  code: string,
  sourceKeys: readonly string[],
  locale: Record<string, string>
): LanguageCoverageReport {
  const missingKeys = sourceKeys.filter((key) => {
    const value = locale[key];
    return typeof value !== "string" || value.trim().length === 0;
  });
  const translatedKeys = sourceKeys.length - missingKeys.length;

  return {
    code,
    coverage: calculateCoverage(translatedKeys, sourceKeys.length),
    missingKeys,
    translatedKeys,
    totalKeys: sourceKeys.length
  };
}

export async function generateTranslationCoverageReport(
  config: ResolvedGlobalyzeConfig
): Promise<TranslationCoverageReport> {
  await ensureLocaleCoverageReady(config);

  const sourceLocale = await readLocaleDictionary(config, config.sourceLocale);
  const sourceKeys = Object.keys(sourceLocale).sort((left, right) =>
    left.localeCompare(right)
  );
  const languages: LanguageCoverageReport[] = [];

  for (const language of config.languages) {
    const locale = await readLocaleDictionary(config, language);
    languages.push(buildLanguageCoverage(language, sourceKeys, locale));
  }

  return {
    sourceLocale: config.sourceLocale,
    totalKeys: sourceKeys.length,
    languages
  };
}
