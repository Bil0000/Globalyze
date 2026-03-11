import path from "node:path";

import { parse } from "@babel/parser";
import generate from "@babel/generator";
import traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { detectRuntimeArtifactFlavor } from "../runtime/languageArtifacts";

import { resolveI18nAdapter } from "../adapters";
import type {
  FileTransformResult,
  ResolvedGlobalyzeConfig
} from "../types";
import { extractDynamicTemplateFromExpression } from "../extractor/dynamicExtractor";
import {
  isDataDrivenTranslatablePropertyName,
  isTranslatableAttributeName,
  isTranslatableObjectPropertyName,
  normalizeUiText,
  shouldExtractObjectProperty
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
  adapter: ReturnType<typeof resolveI18nAdapter>,
  key: string,
  interpolation?: Record<string, string>
): t.CallExpression {
  const parsedInterpolation =
    interpolation && Object.keys(interpolation).length > 0
      ? Object.fromEntries(
          Object.entries(interpolation).map(([name, expression]) => [
            name,
            parseInterpolationExpression(expression)
          ])
        )
      : undefined;
  const expression = adapter.buildTranslationCall(key, parsedInterpolation);

  if (!t.isCallExpression(expression)) {
    throw new GlobalyzeError(
      `Adapter ${adapter.name} produced an invalid translation call for ${key}.`
    );
  }

  return expression;
}

function parseInterpolationExpression(expression: string): t.Expression {
  const parsed = parseModule(`const __globalyze = ${expression};`, expression);
  const declaration = parsed.program.body[0];

  if (
    !t.isVariableDeclaration(declaration) ||
    !declaration.declarations[0]?.init ||
    !t.isExpression(declaration.declarations[0].init)
  ) {
    throw new GlobalyzeError(`Failed to parse interpolation expression: ${expression}`);
  }

  return declaration.declarations[0].init;
}

function createJsxTextReplacement(
  rawText: string,
  adapter: ReturnType<typeof resolveI18nAdapter>,
  key: string
): (t.JSXText | t.JSXExpressionContainer)[] {
  const nodes: (t.JSXText | t.JSXExpressionContainer)[] = [];
  const hasLineBreak = /[\r\n]/.test(rawText);

  if (!hasLineBreak && /^\s+/.test(rawText)) {
    nodes.push(t.jsxText(" "));
  }

  nodes.push(
    t.jsxExpressionContainer(createTranslationExpression(adapter, key))
  );

  if (!hasLineBreak && /\s+$/.test(rawText)) {
    nodes.push(t.jsxText(" "));
  }

  return nodes;
}

function findNearestFunctionBodyPath(
  path: NodePath
): NodePath<t.BlockStatement> | null {
  let current: NodePath | null = path.parentPath;

  while (current) {
    if (
      (current.isFunctionDeclaration() ||
        current.isFunctionExpression() ||
        current.isArrowFunctionExpression()) &&
      t.isBlockStatement(current.node.body)
    ) {
      return current.get("body") as NodePath<t.BlockStatement>;
    }

    current = current.parentPath;
  }

  return null;
}

function resolveObjectPropertyName(
  key: t.ObjectProperty["key"]
): string | null {
  if (t.isIdentifier(key)) {
    return key.name;
  }

  if (t.isStringLiteral(key)) {
    return key.value;
  }

  return null;
}

function normalizeStaticTemplateLiteral(node: t.TemplateLiteral): string | null {
  if (node.expressions.length > 0) {
    return null;
  }

  return normalizeUiText(node.quasis.map((quasi) => quasi.value.cooked ?? "").join(""));
}

export async function transformFile(
  filePath: string,
  keysByText: ReadonlyMap<string, string>,
  config: ResolvedGlobalyzeConfig,
  jsonSidecarImports?: ReadonlyMap<string, string>
): Promise<FileTransformResult> {
  if (filePath.endsWith(".json")) {
    return {
      filePath,
      updated: false,
      replacements: 0
    };
  }

  const source = await readTextFile(filePath);
  const transformed = transformSource(
    filePath,
    source,
    keysByText,
    config,
    jsonSidecarImports
  );

  if (!transformed.updated) {
    return transformed.result;
  }

  await writeTextFile(filePath, `${transformed.code}\n`);

  return transformed.result;
}

export function transformSource(
  filePath: string,
  source: string,
  keysByText: ReadonlyMap<string, string>,
  config: ResolvedGlobalyzeConfig,
  jsonSidecarImports?: ReadonlyMap<string, string>
): {
  result: FileTransformResult;
  updated: boolean;
  code: string;
} {
  if (filePath.endsWith(".json")) {
    return {
      updated: false,
      code: source,
      result: {
        filePath,
        updated: false,
        replacements: 0
      }
    };
  }

  const ast = parseModule(source, filePath);
  const adapter = resolveI18nAdapter(config);
  const state = {
    transformed: false,
    replacements: 0,
    hasTranslationImport: false,
    hasHookImport: false,
    hasConflictingTranslationBinding: false,
    translationImportIndex: -1,
    hookImportIndex: -1,
    hookBodies: [] as NodePath<t.BlockStatement>[]
  };

  traverse(ast, {
    Program(programPath) {
      for (const statement of programPath.node.body) {
        if (
          t.isImportDeclaration(statement) &&
          statement.source.value === (adapter.importPath ?? config.translationImportPath)
        ) {
          state.translationImportIndex = programPath.node.body.indexOf(statement);
          state.hasTranslationImport = statement.specifiers.some(
            (specifier) =>
              t.isImportSpecifier(specifier) &&
              t.isIdentifier(specifier.imported, {
                name: adapter.translationFunctionName
              })
          );
          state.hasHookImport =
            !!adapter.hookName &&
            statement.specifiers.some(
              (specifier) =>
                t.isImportSpecifier(specifier) &&
                t.isIdentifier(specifier.imported, {
                  name: adapter.hookName
                })
            );
          if (state.hasHookImport) {
            state.hookImportIndex = programPath.node.body.indexOf(statement);
          }
        }
      }

      const binding = programPath.scope.getBinding(adapter.translationFunctionName);

      if (binding) {
        const isExpectedImport =
          binding.path.isImportSpecifier() &&
          binding.path.parentPath.isImportDeclaration() &&
          binding.path.parentPath.node.source.value ===
            (adapter.importPath ?? config.translationImportPath);

        if (!isExpectedImport) {
          state.hasConflictingTranslationBinding = true;
        }
      }
    },
    ImportDeclaration(importPath) {
      const sourceValue = importPath.node.source.value;

      if (
        typeof sourceValue !== "string" ||
        !sourceValue.endsWith(".json") ||
        !sourceValue.startsWith(".")
      ) {
        return;
      }

      const resolvedImportPath = path.resolve(
        path.dirname(filePath),
        sourceValue
      );
      const replacement = jsonSidecarImports?.get(resolvedImportPath);

      if (!replacement) {
        return;
      }

      importPath.node.source = t.stringLiteral(
        sourceValue.replace(/\.json$/i, ".globalyze")
      );
      state.transformed = true;
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
        adapter,
        key
      );
      const bodyPath = adapter.canInjectHook
        ? findNearestFunctionBodyPath(path)
        : null;
      if (bodyPath) {
        state.hookBodies.push(bodyPath);
      }

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

      if (t.isStringLiteral(path.node.expression)) {
        const text = normalizeUiText(path.node.expression.value);

        if (!text) {
          return;
        }

        const key = keysByText.get(text);

        if (!key) {
          return;
        }

        path.node.expression = createTranslationExpression(
          adapter,
          key
        );
        const bodyPath = adapter.canInjectHook
          ? findNearestFunctionBodyPath(path)
          : null;
        if (bodyPath) {
          state.hookBodies.push(bodyPath);
        }
        state.transformed = true;
        state.replacements += 1;
        return;
      }

      if (!config.dynamicExtraction || !t.isExpression(path.node.expression)) {
        return;
      }

      const extracted = extractDynamicTemplateFromExpression(path.node.expression);

      if (!extracted) {
        return;
      }

      const key = keysByText.get(extracted.template);

      if (!key) {
        return;
      }

      path.node.expression = createTranslationExpression(
        adapter,
        key,
        extracted.variables
      );
      const bodyPath = adapter.canInjectHook
        ? findNearestFunctionBodyPath(path)
        : null;
      if (bodyPath) {
        state.hookBodies.push(bodyPath);
      }
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
        createTranslationExpression(adapter, key)
      );
      const bodyPath = adapter.canInjectHook
        ? findNearestFunctionBodyPath(path)
        : null;
      if (bodyPath) {
        state.hookBodies.push(bodyPath);
      }
      state.transformed = true;
      state.replacements += 1;
    },
    ObjectProperty(path) {
      if (path.node.computed) {
        return;
      }

      const propertyName = resolveObjectPropertyName(path.node.key);

      if (
        !propertyName ||
        !shouldExtractObjectProperty(path, filePath, propertyName)
      ) {
        return;
      }

      const text = t.isStringLiteral(path.node.value)
        ? normalizeUiText(path.node.value.value)
        : t.isTemplateLiteral(path.node.value)
          ? normalizeStaticTemplateLiteral(path.node.value)
          : null;

      if (!text) {
        return;
      }

      const key = keysByText.get(text);

      if (!key) {
        return;
      }

      path.node.value = createTranslationExpression(adapter, key);
      const bodyPath = adapter.canInjectHook
        ? findNearestFunctionBodyPath(path)
        : null;
      if (bodyPath) {
        state.hookBodies.push(bodyPath);
      }
      state.transformed = true;
      state.replacements += 1;
    }
  });

  if (!state.transformed) {
    return {
      updated: false,
      code: source,
      result: {
        filePath,
        updated: false,
        replacements: 0
      }
    };
  }

  if (adapter.canInjectHook) {
    const uniqueBodies = [...new Set(state.hookBodies)];

    for (const bodyPath of uniqueBodies) {
      const hasLocalBinding = bodyPath.scope.hasOwnBinding(
        adapter.translationFunctionName
      );

      if (!hasLocalBinding && adapter.buildHookStatement) {
        bodyPath.node.body.unshift(adapter.buildHookStatement());
      }
    }
  }

  if (adapter.canInjectHook && adapter.hookName && !state.hasHookImport) {
    ast.program.body.unshift(
      t.importDeclaration(
        [t.importSpecifier(t.identifier(adapter.hookName), t.identifier(adapter.hookName))],
        t.stringLiteral(adapter.importPath ?? config.translationImportPath)
      )
    );
  } else if (!adapter.canInjectHook && !state.hasTranslationImport) {
    if (state.hasConflictingTranslationBinding) {
      throw new GlobalyzeError(
        `Cannot add ${adapter.translationFunctionName} import to ${filePath} because the identifier is already declared locally.`
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
          t.identifier(adapter.translationFunctionName),
          t.identifier(adapter.translationFunctionName)
        )
      );
    } else {
      ast.program.body.unshift(
        t.importDeclaration(
          [
            t.importSpecifier(
              t.identifier(adapter.translationFunctionName),
              t.identifier(adapter.translationFunctionName)
            )
          ],
          t.stringLiteral(adapter.importPath ?? config.translationImportPath)
        )
      );
    }
  }

  const output = generate(ast, {
    jsescOption: {
      minimal: true
    }
  }).code;

  return {
    updated: true,
    code: output,
    result: {
      filePath,
      updated: true,
      replacements: state.replacements
    }
  };
}

function createObjectPropertyKey(name: string): t.Identifier | t.StringLiteral {
  return t.isValidIdentifier(name) ? t.identifier(name) : t.stringLiteral(name);
}

function buildJsonLocalizationExpression(
  value: unknown,
  filePath: string,
  keysByText: ReadonlyMap<string, string>,
  adapter: ReturnType<typeof resolveI18nAdapter>,
  propertyName?: string
): { expression: t.Expression; replacements: number } {
  if (typeof value === "string") {
    const normalized = normalizeUiText(value);
    const isTranslatableProperty =
      typeof propertyName === "string" &&
      (isTranslatableObjectPropertyName(propertyName) ||
        isDataDrivenTranslatablePropertyName(propertyName, filePath));
    const key = normalized ? keysByText.get(normalized) : undefined;

    if (isTranslatableProperty && key) {
      return {
        expression: createTranslationExpression(adapter, key),
        replacements: 1
      };
    }

    return {
      expression: t.stringLiteral(value),
      replacements: 0
    };
  }

  if (Array.isArray(value)) {
    const items = value.map((item) =>
      buildJsonLocalizationExpression(item, filePath, keysByText, adapter)
    );

    return {
      expression: t.arrayExpression(items.map((item) => item.expression)),
      replacements: items.reduce((sum, item) => sum + item.replacements, 0)
    };
  }

  if (value === null) {
    return {
      expression: t.nullLiteral(),
      replacements: 0
    };
  }

  if (typeof value === "number" || typeof value === "boolean") {
    const literal = t.valueToNode(value);

    if (!t.isExpression(literal)) {
      throw new GlobalyzeError(`Failed to serialize JSON value for ${filePath}.`);
    }

    return {
      expression: literal,
      replacements: 0
    };
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, nestedValue]) => {
        const nested = buildJsonLocalizationExpression(
          nestedValue,
          filePath,
          keysByText,
          adapter,
          key
        );

        return {
          property: t.objectProperty(
            createObjectPropertyKey(key),
            nested.expression
          ),
          replacements: nested.replacements
        };
      }
    );

    return {
      expression: t.objectExpression(entries.map((entry) => entry.property)),
      replacements: entries.reduce((sum, entry) => sum + entry.replacements, 0)
    };
  }

  throw new GlobalyzeError(`Unsupported JSON value encountered in ${filePath}.`);
}

async function buildJsonSidecarMap(
  filePaths: readonly string[],
  keysByText: ReadonlyMap<string, string>,
  config: ResolvedGlobalyzeConfig
): Promise<Map<string, string>> {
  const jsonFiles = filePaths.filter((filePath) => filePath.endsWith(".json"));

  if (jsonFiles.length === 0) {
    return new Map<string, string>();
  }

  const flavor = await detectRuntimeArtifactFlavor(config);
  const extension = flavor === "typescript" ? "ts" : "js";
  const adapter = resolveI18nAdapter(config);

  if (adapter.canInjectHook || !adapter.importPath) {
    return new Map<string, string>();
  }

  const sidecarImports = new Map<string, string>();

  for (const filePath of jsonFiles) {
    const source = await readTextFile(filePath);
    const parsed = JSON.parse(source) as unknown;
    const transformed = buildJsonLocalizationExpression(
      parsed,
      filePath,
      keysByText,
      adapter
    );
    const sidecarFilePath = filePath.replace(/\.json$/i, `.globalyze.${extension}`);

    if (transformed.replacements > 0) {
      const program = t.program([
        t.importDeclaration(
          [
            t.importSpecifier(
              t.identifier(adapter.translationFunctionName),
              t.identifier(adapter.translationFunctionName)
            )
          ],
          t.stringLiteral(adapter.importPath ?? config.translationImportPath)
        ),
        t.variableDeclaration("const", [
          t.variableDeclarator(t.identifier("data"), transformed.expression)
        ]),
        t.exportDefaultDeclaration(t.identifier("data"))
      ]);
      const contents = `${generate(program, {
        jsescOption: {
          minimal: true
        }
      }).code}\n`;
      await writeTextFile(sidecarFilePath, contents);
      sidecarImports.set(filePath, sidecarFilePath);
      continue;
    }
  }

  return sidecarImports;
}

export async function transformFiles(
  filePaths: readonly string[],
  keysByText: ReadonlyMap<string, string>,
  config: ResolvedGlobalyzeConfig
): Promise<FileTransformResult[]> {
  const results: FileTransformResult[] = [];
  const jsonSidecarImports = await buildJsonSidecarMap(
    filePaths,
    keysByText,
    config
  );

  for (const filePath of filePaths) {
    results.push(
      await transformFile(filePath, keysByText, config, jsonSidecarImports)
    );
  }

  return results;
}
