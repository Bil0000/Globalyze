import path from "node:path";

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import type { LocaleKeyReference } from "../types";
import { GlobalyzeError } from "../utils/errors";
import {
  buildFileLocalizationMetadata,
  type ResolvedFileLocalizationMetadata
} from "../utils/nameResolver";
import { toPosixPath } from "../utils/fileUtils";

function parseSource(source: string, filePath: string) {
  try {
    return parse(source, {
      sourceType: "module",
      plugins: [
        "jsx",
        "typescript",
        "classProperties",
        "classPrivateProperties",
        "topLevelAwait",
        "importAttributes"
      ]
    });
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unknown parser failure";

    throw new GlobalyzeError(`Failed to parse ${filePath}: ${reason}`);
  }
}

export function extractTranslationKeysFromSource(
  source: string,
  filePath: string,
  translationFunctionName: string
): string[] {
  const ast = parseSource(source, filePath);
  const keys = new Set<string>();

  traverse(ast, {
    CallExpression(path) {
      if (!t.isIdentifier(path.node.callee, { name: translationFunctionName })) {
        return;
      }

      const firstArgument = path.node.arguments[0];

      if (!firstArgument || !t.isStringLiteral(firstArgument)) {
        return;
      }

      if (firstArgument.value.trim().length === 0) {
        return;
      }

      keys.add(firstArgument.value);
    }
  });

  return [...keys];
}

export async function extractTranslationKeysFromFiles(
  filePaths: readonly string[],
  translationFunctionName: string
): Promise<string[]> {
  const extracted = await Promise.all(
    filePaths.map(async (filePath) => {
      const source = await Bun.file(filePath).text();
      return extractTranslationKeysFromSource(
        source,
        filePath,
        translationFunctionName
      );
    })
  );

  return [...new Set(extracted.flat())].sort((left, right) =>
    left.localeCompare(right)
  );
}

export function extractTranslationKeyReferencesFromSource(
  source: string,
  filePath: string,
  translationFunctionName: string,
  metadata?: ResolvedFileLocalizationMetadata
): LocaleKeyReference[] {
  const ast = parseSource(source, filePath);
  const references = new Set<string>();

  traverse(ast, {
    CallExpression(path) {
      if (!t.isIdentifier(path.node.callee, { name: translationFunctionName })) {
        return;
      }

      const firstArgument = path.node.arguments[0];

      if (!firstArgument || !t.isStringLiteral(firstArgument)) {
        return;
      }

      if (firstArgument.value.trim().length === 0) {
        return;
      }

      references.add(firstArgument.value);
    }
  });

  return [...references]
    .sort((left, right) => left.localeCompare(right))
    .map((key) => ({
      key,
      file: filePath,
      pageName: metadata?.pageName,
      pageNames: metadata?.pageNames,
      componentName: metadata?.componentName,
      sourceType: metadata?.sourceType,
      ownershipConfidence: metadata?.ownershipConfidence,
      unresolvedOwnership: metadata?.unresolvedOwnership
    }));
}

export async function extractTranslationKeyReferencesFromFiles(
  filePaths: readonly string[],
  translationFunctionName: string
): Promise<LocaleKeyReference[]> {
  const metadataMap = await buildFileLocalizationMetadata(filePaths);
  const extracted = await Promise.all(
    filePaths.map(async (filePath) => {
      const source = await Bun.file(filePath).text();
      return extractTranslationKeyReferencesFromSource(
        source,
        filePath,
        translationFunctionName,
        metadataMap.get(toPosixPath(path.resolve(filePath)))
      );
    })
  );

  return extracted
    .flat()
    .sort((left, right) => {
      const keyComparison = left.key.localeCompare(right.key);

      if (keyComparison !== 0) {
        return keyComparison;
      }

      return left.file.localeCompare(right.file);
    });
}
