import generate from "@babel/generator";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import type { FileTransformResult, ResolvedGlobalyzeConfig } from "../types";
import { readLocaleDictionary } from "../i18n/localeManager";
import { GlobalyzeError } from "../utils/errors";
import { readTextFile, writeTextFile } from "../utils/fileUtils";

function parseModule(source: string, filePath: string) {
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

function rebuildExpression(
  template: string,
  interpolation: t.ObjectExpression
): t.Expression {
  const mapping = new Map<string, t.Expression>();

  for (const property of interpolation.properties) {
    if (!t.isObjectProperty(property) || !t.isIdentifier(property.key)) {
      continue;
    }

    if (!t.isExpression(property.value)) {
      continue;
    }

    mapping.set(property.key.name, property.value);
  }

  const parts = template.split(/(\{[a-zA-Z0-9_]+\})/g).filter(Boolean);
  let expression: t.Expression | null = null;

  for (const part of parts) {
    const match = /^\{([a-zA-Z0-9_]+)\}$/.exec(part);
    const placeholder = match?.[1] ?? "value";
    const current = match
      ? (mapping.get(placeholder) ?? t.identifier(placeholder))
      : t.stringLiteral(part);

    expression =
      expression === null
        ? current
        : t.binaryExpression("+", expression, current);
  }

  return expression ?? t.stringLiteral(template);
}

export async function reverseDynamicTransformFile(
  filePath: string,
  config: ResolvedGlobalyzeConfig
): Promise<FileTransformResult> {
  const source = await readTextFile(filePath);
  const ast = parseModule(source, filePath);
  const sourceLocale = await readLocaleDictionary(config, config.sourceLocale);
  let replacements = 0;

  traverse(ast, {
    JSXExpressionContainer(path) {
      if (
        !t.isCallExpression(path.node.expression) ||
        !t.isIdentifier(path.node.expression.callee, {
          name: config.translationFunctionName
        })
      ) {
        return;
      }

      const [firstArg, secondArg] = path.node.expression.arguments;

      if (
        !t.isStringLiteral(firstArg) ||
        !t.isObjectExpression(secondArg)
      ) {
        return;
      }

      const template = sourceLocale[firstArg.value];

      if (typeof template !== "string" || !template.includes("{")) {
        return;
      }

      path.node.expression = rebuildExpression(template, secondArg);
      replacements += 1;
    }
  });

  if (replacements === 0) {
    return {
      filePath,
      updated: false,
      replacements: 0
    };
  }

  await writeTextFile(
    filePath,
    `${generate(ast, {
      jsescOption: {
        minimal: true
      }
    }).code}\n`
  );

  return {
    filePath,
    updated: true,
    replacements
  };
}
