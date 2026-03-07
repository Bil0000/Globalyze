import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import type { File } from "@babel/types";

import type { ExtractedString } from "../types";
import { GlobalyzeError } from "../utils/errors";
import { toPosixPath } from "../utils/fileUtils";

const TRANSlatable_ATTRIBUTES = new Set([
  "title",
  "placeholder",
  "aria-label",
  "aria-placeholder",
  "alt",
  "label",
  "helperText",
  "caption"
]);

function parseSource(source: string, filePath: string): File {
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

export function normalizeUiText(value: string): string | null {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  if (!/[\p{L}\p{N}]/u.test(normalized)) {
    return null;
  }

  return normalized;
}

export function isTranslatableAttributeName(attributeName: string): boolean {
  return TRANSlatable_ATTRIBUTES.has(attributeName);
}

function getLocation(
  line: number | undefined,
  column: number | undefined
): { line: number; column: number } {
  return {
    line: line ?? 1,
    column: (column ?? 0) + 1
  };
}

export function extractStringsFromSource(
  source: string,
  filePath: string
): ExtractedString[] {
  const ast = parseSource(source, filePath);
  const extracted: ExtractedString[] = [];
  const normalizedFilePath = toPosixPath(filePath);

  traverse(ast, {
    JSXText(path) {
      const text = normalizeUiText(path.node.value);

      if (!text) {
        return;
      }

      const location = getLocation(
        path.node.loc?.start.line,
        path.node.loc?.start.column
      );

      extracted.push({
        text,
        file: normalizedFilePath,
        line: location.line,
        column: location.column,
        kind: "jsx-text"
      });
    },
    JSXExpressionContainer(path) {
      if (path.parentPath.isJSXAttribute()) {
        return;
      }

      if (path.node.expression.type !== "StringLiteral") {
        return;
      }

      const text = normalizeUiText(path.node.expression.value);

      if (!text) {
        return;
      }

      const location = getLocation(
        path.node.loc?.start.line,
        path.node.loc?.start.column
      );

      extracted.push({
        text,
        file: normalizedFilePath,
        line: location.line,
        column: location.column,
        kind: "jsx-expression-string"
      });
    },
    JSXAttribute(path) {
      if (path.node.name.type !== "JSXIdentifier") {
        return;
      }

      if (!isTranslatableAttributeName(path.node.name.name)) {
        return;
      }

      if (path.node.value?.type !== "StringLiteral") {
        return;
      }

      const text = normalizeUiText(path.node.value.value);

      if (!text) {
        return;
      }

      const location = getLocation(
        path.node.loc?.start.line,
        path.node.loc?.start.column
      );

      extracted.push({
        text,
        file: normalizedFilePath,
        line: location.line,
        column: location.column,
        kind: "jsx-attribute",
        attributeName: path.node.name.name
      });
    }
  });

  return extracted;
}

export async function extractStringsFromFiles(
  filePaths: readonly string[]
): Promise<ExtractedString[]> {
  const extracted = await Promise.all(
    filePaths.map(async (filePath) => {
      const source = await Bun.file(filePath).text();
      return extractStringsFromSource(source, filePath);
    })
  );

  return extracted.flat();
}
