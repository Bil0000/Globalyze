import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import { GlobalyzeError } from "../utils/errors";

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
