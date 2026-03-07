import { parse } from "@babel/parser";
import generate from "@babel/generator";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import type { FileTransformResult, ResolvedGlobalyzeConfig } from "../types";
import {
  isTranslatableAttributeName,
  normalizeUiText
} from "../extractor/stringExtractor";
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

function createTranslationExpression(
  functionName: string,
  key: string
): t.CallExpression {
  return t.callExpression(t.identifier(functionName), [t.stringLiteral(key)]);
}

function createJsxTextReplacement(
  rawText: string,
  functionName: string,
  key: string
): (t.JSXText | t.JSXExpressionContainer)[] {
  const nodes: (t.JSXText | t.JSXExpressionContainer)[] = [];
  const hasLineBreak = /[\r\n]/.test(rawText);

  if (!hasLineBreak && /^\s+/.test(rawText)) {
    nodes.push(t.jsxText(" "));
  }

  nodes.push(
    t.jsxExpressionContainer(createTranslationExpression(functionName, key))
  );

  if (!hasLineBreak && /\s+$/.test(rawText)) {
    nodes.push(t.jsxText(" "));
  }

  return nodes;
}

export async function transformFile(
  filePath: string,
  keysByText: ReadonlyMap<string, string>,
  config: ResolvedGlobalyzeConfig
): Promise<FileTransformResult> {
  const source = await readTextFile(filePath);
  const ast = parseModule(source, filePath);
  const state = {
    transformed: false,
    replacements: 0,
    hasTranslationImport: false,
    hasConflictingTranslationBinding: false,
    translationImportIndex: -1
  };

  traverse(ast, {
    Program(programPath) {
      for (const statement of programPath.node.body) {
        if (
          t.isImportDeclaration(statement) &&
          statement.source.value === config.translationImportPath
        ) {
          state.translationImportIndex = programPath.node.body.indexOf(statement);
          state.hasTranslationImport = statement.specifiers.some(
            (specifier) =>
              t.isImportSpecifier(specifier) &&
              t.isIdentifier(specifier.imported, {
                name: config.translationFunctionName
              })
          );
        }
      }

      const binding = programPath.scope.getBinding(config.translationFunctionName);

      if (binding) {
        const isExpectedImport =
          binding.path.isImportSpecifier() &&
          binding.path.parentPath.isImportDeclaration() &&
          binding.path.parentPath.node.source.value ===
            config.translationImportPath;

        if (!isExpectedImport) {
          state.hasConflictingTranslationBinding = true;
        }
      }
    },
    JSXText(path) {
      const text = normalizeUiText(path.node.value);

      if (!text) {
        return;
      }

      const key = keysByText.get(text);

      if (!key) {
        return;
      }

      const replacement = createJsxTextReplacement(
        path.node.value,
        config.translationFunctionName,
        key
      );

      state.transformed = true;
      state.replacements += 1;

      if (replacement.length === 1) {
        const firstReplacement = replacement[0];

        if (!firstReplacement) {
          throw new GlobalyzeError(
            `Unable to transform JSX text in ${filePath}.`
          );
        }

        path.replaceWith(firstReplacement);
        return;
      }

      path.replaceWithMultiple(replacement);
    },
    JSXExpressionContainer(path) {
      if (path.parentPath.isJSXAttribute()) {
        return;
      }

      if (!t.isStringLiteral(path.node.expression)) {
        return;
      }

      const text = normalizeUiText(path.node.expression.value);

      if (!text) {
        return;
      }

      const key = keysByText.get(text);

      if (!key) {
        return;
      }

      path.node.expression = createTranslationExpression(
        config.translationFunctionName,
        key
      );
      state.transformed = true;
      state.replacements += 1;
    },
    JSXAttribute(path) {
      if (!t.isJSXIdentifier(path.node.name)) {
        return;
      }

      if (!isTranslatableAttributeName(path.node.name.name)) {
        return;
      }

      if (!path.node.value || !t.isStringLiteral(path.node.value)) {
        return;
      }

      const text = normalizeUiText(path.node.value.value);

      if (!text) {
        return;
      }

      const key = keysByText.get(text);

      if (!key) {
        return;
      }

      path.node.value = t.jsxExpressionContainer(
        createTranslationExpression(config.translationFunctionName, key)
      );
      state.transformed = true;
      state.replacements += 1;
    }
  });

  if (!state.transformed) {
    return {
      filePath,
      updated: false,
      replacements: 0
    };
  }

  if (!state.hasTranslationImport) {
    if (state.hasConflictingTranslationBinding) {
      throw new GlobalyzeError(
        `Cannot add ${config.translationFunctionName} import to ${filePath} because the identifier is already declared locally.`
      );
    }

    if (state.translationImportIndex >= 0) {
      const existingImport = ast.program.body[state.translationImportIndex];

      if (!t.isImportDeclaration(existingImport)) {
        throw new GlobalyzeError(
          `Unable to update the translation import in ${filePath}.`
        );
      }

      existingImport.specifiers.push(
        t.importSpecifier(
          t.identifier(config.translationFunctionName),
          t.identifier(config.translationFunctionName)
        )
      );
    } else {
      ast.program.body.unshift(
        t.importDeclaration(
          [
            t.importSpecifier(
              t.identifier(config.translationFunctionName),
              t.identifier(config.translationFunctionName)
            )
          ],
          t.stringLiteral(config.translationImportPath)
        )
      );
    }
  }

  const output = generate(ast, {
    jsescOption: {
      minimal: true
    }
  }).code;

  await writeTextFile(filePath, `${output}\n`);

  return {
    filePath,
    updated: true,
    replacements: state.replacements
  };
}

export async function transformFiles(
  filePaths: readonly string[],
  keysByText: ReadonlyMap<string, string>,
  config: ResolvedGlobalyzeConfig
): Promise<FileTransformResult[]> {
  const results: FileTransformResult[] = [];

  for (const filePath of filePaths) {
    results.push(await transformFile(filePath, keysByText, config));
  }

  return results;
}
