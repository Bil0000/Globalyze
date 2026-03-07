import path from "node:path";

import { createKeyAssignments, generateSemanticKeys } from "../ai/keyGenerator";
import { extractStringsFromFiles } from "../extractor/stringExtractor";
import {
  findMissingTranslationKeys,
  syncLocaleFiles,
  buildSourceLocale
} from "../i18n/localeManager";
import { translateLocales } from "../lingo/lingoClient";
import { scanProjectFiles } from "../scanner/projectScanner";
import { transformFiles } from "../transformer/astTransformer";
import type {
  FullRunResult,
  MissingTranslationReport,
  ResolvedGlobalyzeConfig,
  ScanResult,
  TransformPipelineResult,
  TranslationResult
} from "../types";
import { toRelativePosixPath } from "../utils/fileUtils";

export async function collectProjectStrings(
  config: ResolvedGlobalyzeConfig
): Promise<ScanResult> {
  const files = await scanProjectFiles(config);
  const strings = await extractStringsFromFiles(files);

  return {
    files,
    strings: strings
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

export async function transformProject(
  config: ResolvedGlobalyzeConfig
): Promise<TransformPipelineResult> {
  const files = await scanProjectFiles(config);
  const rawStrings = await extractStringsFromFiles(files);
  const keySourceStrings = rawStrings.map((item) => ({
    ...item,
    file: toRelativePosixPath(config.sourceDir, item.file)
  }));
  const keyResult = await generateSemanticKeys(keySourceStrings, {
    model: config.aiModel,
    batchSize: config.aiBatchSize
  });
  const keyAssignments = createKeyAssignments(
    keySourceStrings,
    keyResult.keysByText
  );
  const transformedFiles = await transformFiles(files, keyResult.keysByText, config);
  const localeSync = await syncLocaleFiles(
    config,
    buildSourceLocale(keyAssignments)
  );

  return {
    files: files.map((filePath) => path.relative(config.rootDir, filePath)),
    strings: rawStrings.map((item) => ({
      ...item,
      file: toRelativePosixPath(config.rootDir, item.file)
    })),
    keyAssignments,
    transformedFiles,
    localeSync,
    usedFallbackKeys: keyResult.usedFallback
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
