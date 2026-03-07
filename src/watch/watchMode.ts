import path from "node:path";

import chokidar, { type FSWatcher } from "chokidar";

import { prepareTransformProject } from "../cli/pipeline";
import {
  buildSourceLocale,
  mergeSourceLocaleDictionary,
  syncLocaleFiles
} from "../i18n/localeManager";
import { transformFiles } from "../transformer/astTransformer";
import type {
  ExtractedString,
  ResolvedGlobalyzeConfig,
  WatchUpdateResult
} from "../types";
import { SUPPORTED_EXTENSIONS, toRelativePosixPath } from "../utils/fileUtils";

function isSupportedSourceFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(
    extension as (typeof SUPPORTED_EXTENSIONS)[number]
  );
}

function shouldIgnorePath(
  filePath: string,
  sourceDir: string,
  ignore: readonly string[]
): boolean {
  const relativePath = toRelativePosixPath(sourceDir, filePath);

  if (relativePath.startsWith("..")) {
    return true;
  }

  return ignore.some(
    (segment) =>
      relativePath === segment ||
      relativePath.startsWith(`${segment}/`) ||
      relativePath.includes(`/${segment}/`)
  );
}

function buildStringId(item: ExtractedString): string {
  return `${item.file}:${item.text}`;
}

function filterNewStrings(
  previous: readonly ExtractedString[],
  next: readonly ExtractedString[]
): ExtractedString[] {
  const previousIds = new Set(previous.map(buildStringId));

  return next.filter((item) => !previousIds.has(buildStringId(item)));
}

export async function processWatchUpdate(
  config: ResolvedGlobalyzeConfig,
  previousStrings: readonly ExtractedString[]
): Promise<WatchUpdateResult> {
  const prepared = await prepareTransformProject(config);
  const transformedFiles = await transformFiles(
    prepared.files,
    prepared.keysByText,
    config
  );
  const mergedSourceLocale = await mergeSourceLocaleDictionary(
    config,
    buildSourceLocale(prepared.keyAssignments)
  );
  const localeSync = await syncLocaleFiles(
    config,
    mergedSourceLocale
  );

  return {
    changedFiles: prepared.files.map((filePath) =>
      toRelativePosixPath(config.rootDir, filePath)
    ),
    newStrings: filterNewStrings(previousStrings, prepared.rawStrings),
    updatedFiles: transformedFiles.filter((item) => item.updated),
    localeSync,
    reusedExistingKeys: prepared.reusedExistingKeys,
    usedFallbackKeys: prepared.usedFallbackKeys,
    fallbackReason: prepared.fallbackReason
  };
}

export function createProjectWatcher(
  config: ResolvedGlobalyzeConfig,
  onChange: () => void
): FSWatcher {
  return chokidar
    .watch(config.sourceDir, {
      ignored: (filePath) =>
        shouldIgnorePath(filePath, config.sourceDir, config.ignore),
      ignoreInitial: true,
      persistent: true,
      usePolling: true,
      interval: 250,
      binaryInterval: 500,
      alwaysStat: false,
      followSymlinks: false,
      atomic: true,
      awaitWriteFinish: {
        stabilityThreshold: 250,
        pollInterval: 100
      }
    })
    .on("all", (eventName, filePath) => {
      if (
        (eventName === "add" || eventName === "change") &&
        isSupportedSourceFile(filePath)
      ) {
        onChange();
      }
    });
}
