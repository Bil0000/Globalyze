import { collectProjectStrings } from "../cli/pipeline";
import { extractTranslationKeysFromFiles } from "../extractor/translationKeyExtractor";
import {
  ensureLocaleCoverageReady,
  findMissingTranslationKeys,
  readLocaleDictionary
} from "../i18n/localeManager";
import { generateTranslationCoverageReport } from "./coverageReport";
import { scanProjectFiles } from "../scanner/projectScanner";
import type {
  ProjectScoreSummary,
  ResolvedGlobalyzeConfig
} from "../types";

function computeGrade(coverage: number, hardcodedStrings: number): "A" | "B" | "C" | "D" {
  if (coverage >= 95 && hardcodedStrings <= 3) {
    return "A";
  }

  if (coverage >= 85) {
    return "B";
  }

  if (coverage >= 70) {
    return "C";
  }

  return "D";
}

function averageCoverage(coverageValues: readonly number[]): number {
  if (coverageValues.length === 0) {
    return 100;
  }

  const total = coverageValues.reduce((sum, value) => sum + value, 0);
  return Math.round(total / coverageValues.length);
}

export async function generateProjectScore(
  config: ResolvedGlobalyzeConfig
): Promise<ProjectScoreSummary> {
  const scanResult = await collectProjectStrings(config);
  const sourceFiles = await scanProjectFiles(config);
  const usedKeys = new Set(
    await extractTranslationKeysFromFiles(
      sourceFiles,
      config.translationFunctionName
    )
  );

  let coverage = 0;
  let missingTranslations = 0;
  let healthyLocales = false;
  let unusedLocaleKeys = 0;

  try {
    await ensureLocaleCoverageReady(config);

    const coverageReport = await generateTranslationCoverageReport(config);
    const targetLanguages = coverageReport.languages.filter(
      (language) => language.code !== config.sourceLocale
    );
    coverage = averageCoverage(targetLanguages.map((language) => language.coverage));

    const missingReport = await findMissingTranslationKeys(config);
    missingTranslations = Object.values(missingReport).reduce(
      (sum, keys) => sum + keys.length,
      0
    );

    const sourceLocale = await readLocaleDictionary(config, config.sourceLocale);
    unusedLocaleKeys = Object.keys(sourceLocale).filter((key) => !usedKeys.has(key))
      .length;
    healthyLocales = missingTranslations === 0 && unusedLocaleKeys === 0;
  } catch {
    coverage = 0;
    missingTranslations = 0;
    unusedLocaleKeys = 0;
    healthyLocales = false;
  }

  return {
    coverage,
    hardcodedStrings: scanResult.strings.length,
    missingTranslations,
    unusedLocaleKeys,
    healthyLocales,
    grade: computeGrade(coverage, scanResult.strings.length)
  };
}
