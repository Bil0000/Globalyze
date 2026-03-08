import path from "node:path";

import fs from "fs-extra";

import { extractTranslationKeyReferencesFromFiles } from "../extractor/translationKeyExtractor";
import { readTranslationGraph } from "../graph/translationGraph";
import {
  readLocaleEntries
} from "../i18n/localeManager";
import { readLocaleFileEntries } from "../i18n/writers/shared";
import { generateTranslationCoverageReport } from "../report/coverageReport";
import { scanProjectFiles } from "../scanner/projectScanner";
import type {
  LocaleInspectionFile,
  LocalizationDoctorReport,
  OwnershipVerificationEntry,
  OwnershipVerificationReport,
  ResolvedGlobalyzeConfig,
  TranslationGraphSummary,
  TranslationInspectionResult,
  TranslationSearchMatch
} from "../types";
import {
  buildFileLocalizationMetadata,
  resolveNameMetadata
} from "../utils/nameResolver";
import { toPosixPath, toRelativePosixPath } from "../utils/fileUtils";

function buildLocaleFileLabel(
  config: ResolvedGlobalyzeConfig,
  language: string,
  fileName: string
): string {
  return toRelativePosixPath(
    config.rootDir,
    path.join(config.localesDir, language, fileName)
  );
}

function matchesScope(fileName: string, key: string, scope: string): boolean {
  const normalizedScope = scope.trim().toLowerCase();
  const normalizedFileName = fileName.toLowerCase();
  const normalizedKey = key.toLowerCase();

  return (
    normalizedFileName === normalizedScope ||
    normalizedFileName.startsWith(`${normalizedScope}.`) ||
    normalizedFileName.includes(normalizedScope) ||
    normalizedKey.startsWith(`${normalizedScope}.`)
  );
}

function describeLocaleStructure(config: ResolvedGlobalyzeConfig): string {
  const formatLabel = config.localeStructure.format.toUpperCase();

  if (config.localeStructure.structure === "single") {
    return `single ${formatLabel}`;
  }

  const splitLabel =
    config.localeStructure.splitStrategy === "page"
      ? "per-page"
      : "per-component";

  return `multiple ${formatLabel} (${splitLabel})`;
}

function calculateAverageCoverage(coverageValues: readonly number[]): number {
  if (coverageValues.length === 0) {
    return 100;
  }

  return Math.round(
    coverageValues.reduce((sum, value) => sum + value, 0) / coverageValues.length
  );
}

function hasNormalizedName(
  values: Iterable<string>,
  expected: string | undefined
): boolean {
  if (!expected) {
    return true;
  }

  for (const value of values) {
    if (value.toLowerCase() === expected) {
      return true;
    }
  }

  return false;
}

export async function readLocaleInspectionFiles(
  config: ResolvedGlobalyzeConfig,
  language: string
): Promise<LocaleInspectionFile[]> {
  const languageDir = path.join(config.localesDir, language);
  const legacyFilePath = path.join(
    config.localesDir,
    `${language}.${config.localeStructure.format}`
  );
  const files: LocaleInspectionFile[] = [];

  if (await fs.pathExists(languageDir)) {
    const fileNames = (await fs.readdir(languageDir))
      .filter((fileName) =>
        fileName.endsWith(`.${config.localeStructure.format}`)
      )
      .sort((left, right) => left.localeCompare(right));

    for (const fileName of fileNames) {
      const filePath = path.join(languageDir, fileName);
      files.push({
        fileName,
        filePath,
        entries: await readLocaleFileEntries(filePath)
      });
    }
  } else if (await fs.pathExists(legacyFilePath)) {
    files.push({
      fileName: path.basename(legacyFilePath),
      filePath: legacyFilePath,
      entries: await readLocaleFileEntries(legacyFilePath)
    });
  }

  return files;
}

export async function inspectTranslationKey(
  config: ResolvedGlobalyzeConfig,
  key: string
): Promise<TranslationInspectionResult | null> {
  const graph = await readTranslationGraph(config.rootDir);
  const sourceEntries = await readLocaleEntries(config, config.sourceLocale);
  const graphEntry = graph[key];
  const sourceEntry = sourceEntries[key];

  if (!graphEntry && !sourceEntry) {
    return null;
  }

  return {
    key,
    value: sourceEntry?.value ?? graphEntry?.text ?? "",
    originFile: graphEntry?.originFile,
    localeFile: graphEntry?.localeFile
      ? buildLocaleFileLabel(config, config.sourceLocale, graphEntry.localeFile)
      : undefined,
    usages: graphEntry?.usages ?? [],
    owner: sourceEntry?.owner ?? graphEntry?.owner,
    locked: sourceEntry?.locked ?? graphEntry?.locked,
    approvalRequired:
      sourceEntry?.approvalRequired ?? graphEntry?.approvalRequired
  };
}

export async function summarizeTranslationGraph(
  config: ResolvedGlobalyzeConfig,
  filters: {
    page?: string;
    component?: string;
  } = {}
): Promise<TranslationGraphSummary> {
  const graph = await readTranslationGraph(config.rootDir);
  const pageCounts = new Map<string, number>();
  const componentCounts = new Map<string, number>();
  const matchingKeys: string[] = [];
  const normalizedPage = filters.page?.trim().toLowerCase();
  const normalizedComponent = filters.component?.trim().toLowerCase();

  for (const [key, entry] of Object.entries(graph)) {
    const pageNames = new Set<string>();
    const componentNames = new Set<string>();

    if (entry.pageNames && entry.pageNames.length > 0) {
      for (const pageName of entry.pageNames) {
        pageNames.add(pageName);
      }
    } else if (entry.pageName) {
      pageNames.add(entry.pageName);
    }
    if (entry.componentName) {
      componentNames.add(entry.componentName);
    }

    if (pageNames.size === 0 || componentNames.size === 0) {
      for (const filePath of [entry.originFile, ...entry.usages]) {
        const metadata = resolveNameMetadata(filePath);

        if (metadata.type === "page" && pageNames.size === 0) {
          pageNames.add(metadata.name);
        } else if (metadata.type === "component" && componentNames.size === 0) {
          componentNames.add(metadata.name);
        }
      }
    }

    for (const name of pageNames) {
      pageCounts.set(name, (pageCounts.get(name) ?? 0) + 1);
    }

    for (const name of componentNames) {
      componentCounts.set(name, (componentCounts.get(name) ?? 0) + 1);
    }

    const matchesPage =
      hasNormalizedName(pageNames, normalizedPage);
    const matchesComponent =
      hasNormalizedName(componentNames, normalizedComponent);

    if (matchesPage && matchesComponent) {
      matchingKeys.push(key);
    }
  }

  return {
    totalKeys: Object.keys(graph).length,
    totalPages: pageCounts.size,
    totalComponents: componentCounts.size,
    topPages: [...pageCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    matchingKeys: matchingKeys.sort((left, right) => left.localeCompare(right))
  };
}

export async function findTranslationKeyUsages(
  key: string,
  projectRoot?: string
): Promise<string[] | null> {
  const graph = await readTranslationGraph(projectRoot);
  const entry = graph[key];

  if (!entry) {
    return null;
  }

  return entry.usages;
}

export async function inspectLocaleLanguage(
  config: ResolvedGlobalyzeConfig,
  language: string,
  scope?: string
): Promise<LocaleInspectionFile[]> {
  const files = await readLocaleInspectionFiles(config, language);

  if (!scope) {
    return files;
  }

  return files
    .map((file) => ({
      ...file,
      entries: Object.fromEntries(
        Object.entries(file.entries).filter(([key]) =>
          matchesScope(file.fileName, key, scope)
        )
      )
    }))
    .filter((file) => Object.keys(file.entries).length > 0);
}

export async function searchTranslations(
  config: ResolvedGlobalyzeConfig,
  text: string
): Promise<TranslationSearchMatch[]> {
  const sourceEntries = await readLocaleEntries(config, config.sourceLocale);
  const graph = await readTranslationGraph(config.rootDir);
  const query = text.trim().toLowerCase();
  const matches = new Map<string, TranslationSearchMatch>();

  for (const [key, entry] of Object.entries(sourceEntries)) {
    if (entry.value.toLowerCase().includes(query)) {
      matches.set(key, {
        key,
        value: entry.value
      });
    }
  }

  for (const [key, entry] of Object.entries(graph)) {
    if (entry.text.toLowerCase().includes(query) && !matches.has(key)) {
      matches.set(key, {
        key,
        value: entry.text
      });
    }
  }

  return [...matches.values()].sort((left, right) =>
    left.key.localeCompare(right.key)
  );
}

export async function buildLocalizationDoctorReport(
  config: ResolvedGlobalyzeConfig
): Promise<LocalizationDoctorReport> {
  const sourceEntries = await readLocaleEntries(config, config.sourceLocale);
  const coverageReport = await generateTranslationCoverageReport(config);
  const files = await scanProjectFiles(config);
  const references = await extractTranslationKeyReferencesFromFiles(
    files,
    config.translationFunctionName
  );
  const activeKeys = new Set<string>(
    references.map((reference) => reference.key)
  );

  const nonSourceCoverage = coverageReport.languages
    .filter((language) => language.code !== config.sourceLocale)
    .map((language) => language.coverage);
  const duplicateBuckets = new Map<string, string[]>();

  for (const [key, entry] of Object.entries(sourceEntries)) {
    const keys = duplicateBuckets.get(entry.value) ?? [];
    keys.push(key);
    duplicateBuckets.set(entry.value, keys);
  }

  const unusedKeys = Object.keys(sourceEntries).filter((key) => !activeKeys.has(key));

  return {
    totalKeys: Object.keys(sourceEntries).length,
    unusedKeys: unusedKeys.length,
    duplicateStrings: [...duplicateBuckets.values()].filter((keys) => keys.length > 1)
      .length,
    coverage: calculateAverageCoverage(nonSourceCoverage),
    lockedKeysModified: 0,
    approvalRequiredChanges: 0,
    localeStructureLabel: describeLocaleStructure(config),
    languages: config.languages
  };
}

export async function verifyOwnershipAssignments(
  config: ResolvedGlobalyzeConfig
): Promise<OwnershipVerificationReport> {
  const files = await scanProjectFiles(config);
  const metadata = await buildFileLocalizationMetadata(files);
  const entries: OwnershipVerificationEntry[] = [];

  for (const filePath of files) {
    const value = metadata.get(toPosixPath(path.resolve(filePath)));

    if (!value || value.sourceType === "page") {
      continue;
    }

    const pageNames =
      value.pageNames && value.pageNames.length > 0
        ? value.pageNames
        : value.pageName
          ? [value.pageName]
          : undefined;
    const status: OwnershipVerificationEntry["status"] =
      value.ownershipConfidence === "high"
        ? "route-owned"
        : value.ownershipConfidence === "learned"
          ? "learned"
          : value.ownershipConfidence === "shared"
            ? "shared"
            : "unresolved";

    entries.push({
      file: toRelativePosixPath(config.rootDir, filePath),
      componentName: value.componentName,
      pageName: value.pageName,
      pageNames,
      status
    });
  }

  entries.sort((left, right) => left.file.localeCompare(right.file));

  return {
    totalFiles: files.length,
    totalPages: [...metadata.values()].filter((item) => item.sourceType === "page").length,
    totalComponents: entries.length,
    routeOwned: entries.filter((entry) => entry.status === "route-owned"),
    learned: entries.filter((entry) => entry.status === "learned"),
    shared: entries.filter((entry) => entry.status === "shared"),
    unresolved: entries.filter((entry) => entry.status === "unresolved")
  };
}
