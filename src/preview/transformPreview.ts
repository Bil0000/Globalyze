import { createPatch } from "diff";

import { prepareTransformProject } from "../cli/pipeline";
import { transformSource } from "../transformer/astTransformer";
import type {
  PreviewFileDiff,
  PreviewResult,
  ResolvedGlobalyzeConfig
} from "../types";
import { readTextFile, toRelativePosixPath } from "../utils/fileUtils";

function buildUnifiedDiff(
  relativePath: string,
  before: string,
  after: string
): string {
  return createPatch(relativePath, `${before}\n`, `${after}\n`, "before", "after");
}

export async function generateTransformPreview(
  config: ResolvedGlobalyzeConfig
): Promise<PreviewResult> {
  const prepared = await prepareTransformProject(config);
  const files: PreviewFileDiff[] = [];

  for (const filePath of prepared.files) {
    const source = await readTextFile(filePath);
    const transformed = transformSource(
      filePath,
      source,
      prepared.keysByText,
      config
    );

    if (!transformed.updated) {
      continue;
    }

    const before = source.trimEnd();
    const after = transformed.code.trimEnd();
    const relativePath = toRelativePosixPath(config.rootDir, filePath);

    files.push({
      filePath,
      relativePath,
      before,
      after,
      diff: buildUnifiedDiff(relativePath, before, after),
      replacements: transformed.result.replacements
    });
  }

  return {
    files,
    rawStrings: prepared.rawStrings,
    reusedExistingKeys: prepared.reusedExistingKeys,
    usedFallbackKeys: prepared.usedFallbackKeys,
    fallbackReason: prepared.fallbackReason
  };
}
