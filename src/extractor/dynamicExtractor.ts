import path from "node:path";

import { parse } from "@babel/parser";
import generate from "@babel/generator";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import type { DynamicExtractionCandidate } from "../types";
import { GlobalyzeError } from "../utils/errors";
import { toPosixPath } from "../utils/fileUtils";
import {
  buildFileLocalizationMetadata,
  resolveComponentName,
  resolvePageName,
  type ResolvedFileLocalizationMetadata
} from "../utils/nameResolver";

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

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ");
}

function variableNameFromExpression(expression: t.Expression, index: number): string {
  if (t.isIdentifier(expression)) {
    return expression.name;
  }

  if (t.isMemberExpression(expression) && t.isIdentifier(expression.property)) {
    return expression.property.name;
  }

  return index === 0 ? "value" : `value${String(index + 1)}`;
}

export function extractDynamicTemplateFromExpression(
  expression: t.Expression
): { template: string; variables: Record<string, string> } | null {
  if (t.isTemplateLiteral(expression)) {
    const variables: Record<string, string> = {};
    const parts: string[] = [];

    expression.quasis.forEach((quasi, index) => {
      parts.push(normalizeText(quasi.value.cooked ?? ""));
      const currentExpression = expression.expressions[index];

      if (!currentExpression || !t.isExpression(currentExpression)) {
        return;
      }

      const variableName = variableNameFromExpression(currentExpression, index);
      variables[variableName] = generate(currentExpression).code;
      parts.push(`{${variableName}}`);
    });

    const template = parts.join("").trim();
    return template.includes("{") ? { template, variables } : null;
  }

  if (!t.isBinaryExpression(expression, { operator: "+" })) {
    return null;
  }

  const variables: Record<string, string> = {};
  const parts: string[] = [];
  let variableIndex = 0;

  const visit = (node: t.Expression): void => {
    if (t.isBinaryExpression(node, { operator: "+" })) {
      if (t.isExpression(node.left)) {
        visit(node.left);
      }
      if (t.isExpression(node.right)) {
        visit(node.right);
      }
      return;
    }

    if (t.isStringLiteral(node)) {
      parts.push(normalizeText(node.value));
      return;
    }

    const variableName = variableNameFromExpression(node, variableIndex);
    variables[variableName] = generate(node).code;
    parts.push(`{${variableName}}`);
    variableIndex += 1;
  };

  visit(expression);
  const template = parts.join("").trim();
  return template.includes("{") ? { template, variables } : null;
}

export function extractDynamicStringsFromSource(
  source: string,
  filePath: string,
  metadata?: ResolvedFileLocalizationMetadata
): DynamicExtractionCandidate[] {
  const ast = parseSource(source, filePath);
  const componentName =
    metadata?.componentName ?? resolveComponentName(filePath, source);
  const pageName = metadata?.pageName ?? resolvePageName(filePath) ?? undefined;
  const pageNames = metadata?.pageNames;
  const candidates: DynamicExtractionCandidate[] = [];

  traverse(ast, {
    JSXExpressionContainer(path) {
      if (path.parentPath.isJSXAttribute()) {
        return;
      }

      if (!t.isExpression(path.node.expression)) {
        return;
      }

      const extracted = extractDynamicTemplateFromExpression(path.node.expression);

      if (!extracted) {
        return;
      }

      candidates.push({
        text: extracted.template,
        template: extracted.template,
        file: toPosixPath(filePath),
        line: path.node.loc?.start.line ?? 1,
        column: (path.node.loc?.start.column ?? 0) + 1,
        variables: extracted.variables,
        componentName,
        pageName,
        pageNames,
        elementType:
          path.parentPath.isJSXElement() &&
          t.isJSXIdentifier(path.parentPath.node.openingElement.name)
            ? path.parentPath.node.openingElement.name.name
            : undefined
      });
    }
  });

  return candidates;
}

export async function extractDynamicStringsFromFiles(
  filePaths: readonly string[]
): Promise<DynamicExtractionCandidate[]> {
  const metadataMap = await buildFileLocalizationMetadata(filePaths);
  const extracted = await Promise.all(
    filePaths.map(async (filePath) => {
      const source = await Bun.file(filePath).text();
      return extractDynamicStringsFromSource(
        source,
        filePath,
        metadataMap.get(toPosixPath(path.resolve(filePath)))
      );
    })
  );

  return extracted.flat();
}
