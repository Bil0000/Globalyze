import path from "node:path";

import { createKeyAssignments, generateSemanticKeys } from "../ai/keyGenerator";
import { extractDynamicStringsFromFiles } from "../extractor/dynamicExtractor";
import { extractStringsFromFiles } from "../extractor/stringExtractor";
import {
  extractTranslationKeyReferencesFromFiles,
  extractTranslationKeysFromFiles
} from "../extractor/translationKeyExtractor";
import {
  readLocaleDictionary,
  findMissingTranslationKeys,
  syncLocaleFiles,
  buildSourceLocale
} from "../i18n/localeManager";
import { translateLocales } from "../lingo/lingoClient";
import { scanProjectFiles } from "../scanner/projectScanner";
import { transformFiles } from "../transformer/astTransformer";
import type {
  ExtractedString,
  FullRunResult,
  MissingTranslationReport,
  ResolvedGlobalyzeConfig,
  ScanResult,
  TransformPreparationResult,
  TransformPipelineResult,
  TranslationResult
} from "../types";
import { toRelativePosixPath } from "../utils/fileUtils";
import { GlobalyzeError } from "../utils/errors";

export async function collectProjectStrings(
  config: ResolvedGlobalyzeConfig
): Promise<ScanResult> {
  const files = await scanProjectFiles(config);
  const strings = await extractStringsFromFiles(files);
  const dynamicStrings = config.dynamicExtraction
    ? await extractDynamicStringsFromFiles(files)
    : [];
  const normalizedDynamicStrings: ExtractedString[] = dynamicStrings.map((item) => ({
    text: item.text,
    file: item.file,
    line: item.line,
    column: item.column,
    kind: "jsx-dynamic",
    componentName: item.componentName,
    pageName: item.pageName,
    pageNames: item.pageNames,
    elementType: item.elementType,
    interpolation: item.variables
  }));

  return {
    files,
    strings: [...strings, ...normalizedDynamicStrings]
      .map((item) => ({
        ...item,
        file: toRelativePosixPath(config.rootDir, item.file)
      }))
      .sort((left, right) => {
        const fileComparison = left.file.localeCompare(right.file);

        if (fileComparison !== 0) {
          return fileComparison;
        }

        if (left.line !== right.line) {
          return left.line - right.line;
        }

        return left.column - right.column;
      })
  };
}

export async function prepareTransformProject(
  config: ResolvedGlobalyzeConfig
): Promise<TransformPreparationResult> {
  const files = await scanProjectFiles(config);
  const rawStrings = await extractStringsFromFiles(files);
  const dynamicStrings = config.dynamicExtraction
    ? await extractDynamicStringsFromFiles(files)
    : [];
  const normalizedDynamicStrings: ExtractedString[] = dynamicStrings.map((item) => ({
    text: item.text,
    file: item.file,
    line: item.line,
    column: item.column,
    kind: "jsx-dynamic",
    componentName: item.componentName,
    pageName: item.pageName,
    pageNames: item.pageNames,
    elementType: item.elementType,
    interpolation: item.variables
  }));
  const keySourceStrings = [...rawStrings, ...normalizedDynamicStrings].map((item) => ({
    ...item,
    file: toRelativePosixPath(config.sourceDir, item.file)
  }));
  const existingSourceLocale = await readLocaleDictionary(
    config,
    config.sourceLocale
  );
  const existingTranslationKeys =
    rawStrings.length === 0
      ? await extractTranslationKeysFromFiles(
          files,
          config.translationFunctionName
        )
      : [];
  const sourceAssignments =
    rawStrings.length === 0
      ? await extractTranslationKeyReferencesFromFiles(
          files,
          config.translationFunctionName
        )
      : [];

  if (
    rawStrings.length === 0 &&
    existingTranslationKeys.length > 0 &&
    Object.keys(existingSourceLocale).length === 0
  ) {
    throw new GlobalyzeError(
      `The project appears to be already transformed, but the source locale output for ${config.sourceLocale} is empty in ${config.localesDir}. Globalyze cannot rebuild source strings from translation keys alone. Restore the source locale files from git, or rerun Globalyze on an untransformed source tree.`
    );
  }

  const keyResult = await generateSemanticKeys(keySourceStrings, {
    model: config.openAiModel,
    geminiModel: config.geminiModel,
    batchSize: config.aiBatchSize,
    existingLocale: existingSourceLocale
  });
  const keyAssignments = createKeyAssignments(
    keySourceStrings,
    keyResult.keysByText
  );

  return {
    files,
    rawStrings: [...rawStrings, ...normalizedDynamicStrings],
    keyAssignments,
    sourceAssignments:
      keyAssignments.length > 0 ? keyAssignments : sourceAssignments,
    keysByText: keyResult.keysByText,
    usedFallbackKeys: keyResult.usedFallback,
    fallbackReason: keyResult.fallbackReason,
    reusedExistingKeys: keyResult.reusedExistingKeys
  };
}

export async function transformProject(
  config: ResolvedGlobalyzeConfig
): Promise<TransformPipelineResult> {
  const prepared = await prepareTransformProject(config);
  const transformedFiles = await transformFiles(
    prepared.files,
    prepared.keysByText,
    config
  );
  const localeSync = await syncLocaleFiles(
    config,
    buildSourceLocale(prepared.keyAssignments),
    {
      sourceAssignments: prepared.sourceAssignments
    }
  );

  return {
    files: prepared.files.map((filePath) => path.relative(config.rootDir, filePath)),
    strings: prepared.rawStrings.map((item) => ({
      ...item,
      file: toRelativePosixPath(config.rootDir, item.file)
    })),
    keyAssignments: prepared.keyAssignments,
    sourceAssignments: prepared.sourceAssignments,
    transformedFiles,
    localeSync,
    usedFallbackKeys: prepared.usedFallbackKeys
  };
}

export async function translateProject(
  config: ResolvedGlobalyzeConfig
): Promise<TranslationResult> {
  return translateLocales(config);
}

export async function runFullPipeline(
  config: ResolvedGlobalyzeConfig
): Promise<FullRunResult> {
  const transform = await transformProject(config);
  const translation = await translateProject(config);

  return {
    transform,
    translation
  };
}

export async function checkTranslationCoverage(
  config: ResolvedGlobalyzeConfig
): Promise<MissingTranslationReport> {
  return findMissingTranslationKeys(config);
}
