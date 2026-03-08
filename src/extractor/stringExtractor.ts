import path from "node:path";

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { File } from "@babel/types";

import type { ExtractedString } from "../types";
import { GlobalyzeError } from "../utils/errors";
import { toPosixPath } from "../utils/fileUtils";
import {
  buildFileLocalizationMetadata,
  resolveComponentName,
  resolvePageName,
  type ResolvedFileLocalizationMetadata
} from "../utils/nameResolver";

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
  filePath: string,
  metadata?: ResolvedFileLocalizationMetadata
): ExtractedString[] {
  const ast = parseSource(source, filePath);
  const extracted: ExtractedString[] = [];
  const normalizedFilePath = toPosixPath(filePath);
  const componentName =
    metadata?.componentName ?? resolveComponentName(filePath, source);
  const pageName = metadata?.pageName ?? resolvePageName(filePath) ?? undefined;
  const pageNames = metadata?.pageNames;

  function resolveElementType(path: {
    parentPath: {
      isJSXElement: () => boolean;
      node?: unknown;
    };
  }): string | undefined {
    if (!path.parentPath.isJSXElement()) {
      return undefined;
    }

    const parentNode = path.parentPath.node as t.Node | null | undefined;

    if (!parentNode || !t.isJSXElement(parentNode)) {
      return undefined;
    }

    return t.isJSXIdentifier(parentNode.openingElement.name)
      ? parentNode.openingElement.name.name
      : undefined;
  }

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
        kind: "jsx-text",
        componentName,
        pageName,
        pageNames,
        elementType: resolveElementType(path)
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
        kind: "jsx-expression-string",
        componentName,
        pageName,
        pageNames,
        elementType: resolveElementType(path)
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
        attributeName: path.node.name.name,
        componentName,
        pageName,
        pageNames,
        elementType:
          t.isJSXOpeningElement(path.parentPath.node) &&
          t.isJSXIdentifier(path.parentPath.node.name)
            ? path.parentPath.node.name.name
            : undefined
      });
    }
  });

  return extracted;
}

export async function extractStringsFromFiles(
  filePaths: readonly string[]
): Promise<ExtractedString[]> {
  const metadataMap = await buildFileLocalizationMetadata(filePaths);
  const extracted = await Promise.all(
    filePaths.map(async (filePath) => {
      const source = await Bun.file(filePath).text();
      return extractStringsFromSource(
        source,
        filePath,
        metadataMap.get(toPosixPath(path.resolve(filePath)))
      );
    })
  );

  return extracted.flat();
}
