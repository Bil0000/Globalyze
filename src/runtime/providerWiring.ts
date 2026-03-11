import path from "node:path";

import generate from "@babel/generator";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import { resolveI18nAdapter } from "../adapters";
import type {
  DetectedFramework,
  DetectedPackageManager,
  ResolvedGlobalyzeConfig
} from "../types";
import { GlobalyzeError } from "../utils/errors";
import { detectFramework } from "../utils/frameworkDetection";
import { pathExists, readTextFile, writeTextFile } from "../utils/fileUtils";
import { formatGeneratedFileContents } from "../utils/projectFormatter";
import { ensureLanguageArtifacts } from "./languageArtifacts";

interface RuntimeEntryCandidate {
  filePath: string;
  label: string;
}

export interface RuntimeWiringPreview {
  framework: DetectedFramework;
  entryFile?: string;
  canAutoWire: boolean;
  alreadyWired?: boolean;
  skippedReason?: string;
}

export interface RuntimeWiringResult {
  framework: DetectedFramework;
  entryFile?: string;
  wired: boolean;
  alreadyWired?: boolean;
  guidancePath?: string;
  skippedReason?: string;
  languageSwitcherPath?: string;
  localeHookPath?: string;
  languageLabelsPath?: string;
  devSwitcherInjected?: boolean;
  createdArtifacts?: string[];
  skippedArtifacts?: string[];
}

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

function requiresGeneratedLocaleProvider(adapterName: string): boolean {
  return (
    adapterName === "generic" ||
    adapterName === "custom" ||
    adapterName === "react-intl"
  );
}

function buildProviderAttributes(
  adapterName: string,
  options: {
    resolveLocaleAtRuntime: boolean;
    resolveMessagesAtRuntime: boolean;
  }
): t.JSXAttribute[] | null {
  if (adapterName === "next-intl" || adapterName === "react-intl") {
    return [
      t.jsxAttribute(
        t.jsxIdentifier("locale"),
        options.resolveLocaleAtRuntime
          ? t.jsxExpressionContainer(
              t.callExpression(t.identifier("getCurrentLocale"), [])
            )
          : t.stringLiteral("en")
      ),
      t.jsxAttribute(
        t.jsxIdentifier("messages"),
        t.jsxExpressionContainer(
          options.resolveMessagesAtRuntime
            ? t.callExpression(t.identifier("getCurrentMessages"), [])
            : t.objectExpression([])
        )
      )
    ];
  }

  return null;
}

function canAutoInjectAdapterProvider(adapterName: string): boolean {
  return buildProviderAttributes(adapterName, {
    resolveLocaleAtRuntime: false,
    resolveMessagesAtRuntime: false
  }) !== null;
}

function ensureImport(
  ast: t.File,
  importPath: string,
  importName: string
): void {
  let importDeclaration = ast.program.body.find(
    (statement): statement is t.ImportDeclaration =>
      t.isImportDeclaration(statement) && statement.source.value === importPath
  );

  if (!importDeclaration) {
    importDeclaration = t.importDeclaration(
      [t.importSpecifier(t.identifier(importName), t.identifier(importName))],
      t.stringLiteral(importPath)
    );
    ast.program.body.unshift(importDeclaration);
    return;
  }

  if (
    importDeclaration.specifiers.some(
      (specifier) =>
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported, { name: importName })
    )
  ) {
    return;
  }

  importDeclaration.specifiers.push(
    t.importSpecifier(t.identifier(importName), t.identifier(importName))
  );
}

function buildRelativeImportPath(fromFilePath: string, targetFilePath: string): string {
  const relativePath = path
    .relative(path.dirname(fromFilePath), targetFilePath)
    .replace(/\.(ts|tsx|js|jsx)$/, "")
    .replace(/\\/g, "/");

  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function buildWrappedApplication(
  child: t.JSXElement | t.JSXFragment | t.JSXExpressionContainer,
  options: {
    adapterName: string;
    providerComponentName?: string;
    wrapWithLocaleProvider: boolean;
    includeInitialLocale?: boolean;
    resolveProviderLocaleAtRuntime?: boolean;
    resolveProviderMessagesAtRuntime?: boolean;
  }
): t.JSXElement | t.JSXFragment {
  let wrapped: t.JSXElement | t.JSXFragment | t.JSXExpressionContainer = child;
  const providerAttributes = buildProviderAttributes(options.adapterName, {
    resolveLocaleAtRuntime: options.resolveProviderLocaleAtRuntime ?? false,
    resolveMessagesAtRuntime: options.resolveProviderMessagesAtRuntime ?? false
  });

  if (options.providerComponentName && providerAttributes) {
    const providerName = t.jsxIdentifier(options.providerComponentName);
    wrapped = t.jsxElement(
      t.jsxOpeningElement(providerName, providerAttributes, false),
      t.jsxClosingElement(providerName),
      [wrapped]
    );
  }

  if (options.wrapWithLocaleProvider) {
    wrapped = t.jsxElement(
      t.jsxOpeningElement(
        t.jsxIdentifier("GlobalyzeLocaleProvider"),
        options.includeInitialLocale
          ? [
              t.jsxAttribute(
                t.jsxIdentifier("initialLocale"),
                t.jsxExpressionContainer(
                  t.callExpression(t.identifier("getCurrentLocale"), [])
                )
              )
            ]
          : [],
        false
      ),
      t.jsxClosingElement(t.jsxIdentifier("GlobalyzeLocaleProvider")),
      [wrapped]
    );
  }

  if (!t.isJSXElement(wrapped)) {
    return t.jsxFragment(
      t.jsxOpeningFragment(),
      t.jsxClosingFragment(),
      [wrapped]
    );
  }

  return wrapped;
}

function buildDevSwitcherElement(): t.JSXExpressionContainer {
  return t.jsxExpressionContainer(
    t.logicalExpression(
      "&&",
      t.binaryExpression(
        "===",
        t.memberExpression(
          t.memberExpression(t.identifier("process"), t.identifier("env")),
          t.identifier("NODE_ENV")
        ),
        t.stringLiteral("development")
      ),
      t.jsxElement(
        t.jsxOpeningElement(
          t.jsxIdentifier("div"),
          [
            t.jsxAttribute(
              t.jsxIdentifier("style"),
              t.jsxExpressionContainer(
                t.objectExpression([
                  t.objectProperty(
                    t.identifier("position"),
                    t.stringLiteral("fixed")
                  ),
                  t.objectProperty(t.identifier("bottom"), t.numericLiteral(16)),
                  t.objectProperty(t.identifier("right"), t.numericLiteral(16)),
                  t.objectProperty(t.identifier("zIndex"), t.numericLiteral(9999))
                ])
              )
            )
          ],
          false
        ),
        t.jsxClosingElement(t.jsxIdentifier("div")),
        [
          t.jsxElement(
            t.jsxOpeningElement(
              t.jsxIdentifier("GlobalyzeLanguageSwitcher"),
              [],
              true
            ),
            null,
            []
          )
        ]
      )
    )
  );
}

function appendDevSwitcherWithinTree(
  node: t.JSXElement | t.JSXFragment | t.JSXExpressionContainer
): t.JSXElement | t.JSXFragment | t.JSXExpressionContainer {
  const switcher = buildDevSwitcherElement();

  if (t.isJSXExpressionContainer(node)) {
    return t.jsxFragment(
      t.jsxOpeningFragment(),
      t.jsxClosingFragment(),
      [node, switcher]
    );
  }

  if (t.isJSXFragment(node)) {
    return t.jsxFragment(
      t.jsxOpeningFragment(),
      t.jsxClosingFragment(),
      [...node.children, switcher]
    );
  }

  return t.jsxElement(
    node.openingElement,
    node.closingElement,
    [...node.children, switcher]
  );
}

function hasComponentUsage(ast: t.File, componentName: string): boolean {
  let found = false;

  traverse(ast, {
    JSXOpeningElement(path) {
      if (t.isJSXIdentifier(path.node.name, { name: componentName })) {
        found = true;
        path.stop();
      }
    }
  });

  return found;
}

async function detectRuntimeEntry(
  rootDir: string,
  framework: DetectedFramework
): Promise<RuntimeEntryCandidate | null> {
  const candidates: Record<DetectedFramework, string[]> = {
    "next-app-router": [
      "app/layout.tsx",
      "app/layout.jsx",
      "app/layout.ts",
      "app/layout.js",
      "src/app/layout.tsx",
      "src/app/layout.jsx",
      "src/app/layout.ts",
      "src/app/layout.js"
    ],
    "next-pages-router": [
      "pages/_app.tsx",
      "pages/_app.jsx",
      "pages/_app.ts",
      "pages/_app.js",
      "src/pages/_app.tsx",
      "src/pages/_app.jsx",
      "src/pages/_app.ts",
      "src/pages/_app.js"
    ],
    "tanstack-start": [
      "src/routes/__root.tsx",
      "src/routes/__root.jsx",
      "src/routes/__root.ts",
      "src/routes/__root.js",
      "src/routes/root.tsx",
      "src/routes/root.jsx",
      "src/routes/root.ts",
      "src/routes/root.js",
      "routes/__root.tsx",
      "routes/__root.jsx",
      "routes/__root.ts",
      "routes/__root.js",
      "routes/root.tsx",
      "routes/root.jsx",
      "routes/root.ts",
      "routes/root.js",
      "src/app/__root.tsx",
      "src/app/__root.jsx",
      "src/app/__root.ts",
      "src/app/__root.js",
      "app/__root.tsx",
      "app/__root.jsx",
      "app/__root.ts",
      "app/__root.js"
    ],
    remix: [
      "app/root.tsx",
      "app/root.jsx",
      "app/root.ts",
      "app/root.js",
      "src/app/root.tsx",
      "src/app/root.jsx",
      "src/app/root.ts",
      "src/app/root.js"
    ],
    "react-router": [
      "app/root.tsx",
      "app/root.jsx",
      "app/root.ts",
      "app/root.js",
      "src/app/root.tsx",
      "src/app/root.jsx",
      "src/app/root.ts",
      "src/app/root.js",
      "src/routes/root.tsx",
      "src/routes/root.jsx",
      "src/routes/root.ts",
      "src/routes/root.js",
      "routes/root.tsx",
      "routes/root.jsx",
      "routes/root.ts",
      "routes/root.js",
      "src/root.tsx",
      "src/root.jsx",
      "src/root.ts",
      "src/root.js",
      "root.tsx",
      "root.jsx",
      "root.ts",
      "root.js",
      "src/main.ts",
      "src/main.tsx",
      "src/main.js",
      "src/main.jsx",
      "src/index.ts",
      "src/index.tsx",
      "src/index.js",
      "src/index.jsx",
      "src/App.tsx",
      "src/App.jsx",
      "src/App.ts",
      "src/App.js"
    ],
    "vite-react": [
      "src/main.ts",
      "src/main.tsx",
      "src/main.js",
      "src/main.jsx",
      "src/App.tsx",
      "src/App.jsx",
      "src/App.ts",
      "src/App.js"
    ],
    "plain-react": [
      "src/main.ts",
      "src/main.tsx",
      "src/main.js",
      "src/main.jsx",
      "src/index.ts",
      "src/index.tsx",
      "src/index.js",
      "src/index.jsx",
      "src/App.tsx",
      "src/App.jsx",
      "src/App.ts",
      "src/App.js"
    ],
    unknown: []
  };

  for (const candidate of candidates[framework]) {
    const filePath = path.join(rootDir, candidate);

    if (await pathExists(filePath)) {
      return {
        filePath,
        label: candidate
      };
    }
  }

  return null;
}

async function detectExistingRuntimeWiring(
  entryFilePath: string,
  adapterName: string,
  providerComponentName?: string
): Promise<boolean> {
  const source = await readTextFile(entryFilePath);
  const ast = parseModule(source, entryFilePath);

  if (hasComponentUsage(ast, "GlobalyzeLocaleProvider")) {
    return true;
  }

  if (hasComponentUsage(ast, "GlobalyzeLanguageSwitcher")) {
    return true;
  }

  if (providerComponentName && hasComponentUsage(ast, providerComponentName)) {
    return true;
  }

  return !requiresGeneratedLocaleProvider(adapterName) && !!providerComponentName
    ? false
    : false;
}

export async function inspectRuntimeProviderTarget(
  config: ResolvedGlobalyzeConfig
): Promise<RuntimeWiringPreview> {
  const adapter = resolveI18nAdapter(config);
  const framework = await detectFramework(config.rootDir);
  const entry = await detectRuntimeEntry(config.rootDir, framework);

  if (!entry) {
    return {
      framework,
      canAutoWire: false,
      skippedReason: "No predictable runtime entry file was detected."
    };
  }

  if (
    framework !== "next-app-router" &&
    framework !== "next-pages-router" &&
    framework !== "tanstack-start" &&
    framework !== "remix" &&
    framework !== "vite-react" &&
    framework !== "react-router" &&
    framework !== "plain-react"
  ) {
    return {
      framework,
      entryFile: entry.filePath,
      canAutoWire: false,
      skippedReason:
        "Automatic provider wiring is only supported for predictable runtimes."
    };
  }

  if (
    !requiresGeneratedLocaleProvider(adapter.name) &&
    adapter.canInjectProvider &&
    (!adapter.providerImportPath ||
      !adapter.providerComponentName ||
      !canAutoInjectAdapterProvider(adapter.name))
  ) {
    return {
      framework,
      entryFile: entry.filePath,
      canAutoWire: false,
      skippedReason:
        "Automatic provider injection is not implemented safely for the selected adapter."
    };
  }

  if (
    await detectExistingRuntimeWiring(
      entry.filePath,
      adapter.name,
      adapter.providerComponentName
    )
  ) {
    return {
      framework,
      entryFile: entry.filePath,
      canAutoWire: false,
      alreadyWired: true,
      skippedReason: "Runtime provider is already wired in the detected entry file."
    };
  }

  return {
    framework,
    entryFile: entry.filePath,
    canAutoWire: true
  };
}

function containsJsxComponentName(
  node: t.JSXElement | t.JSXFragment,
  componentName: string
): boolean {
  let found = false;

  traverse(
    t.file(t.program([t.expressionStatement(node)])),
    {
      JSXOpeningElement(path) {
        if (t.isJSXIdentifier(path.node.name, { name: componentName })) {
          found = true;
          path.stop();
        }
      }
    },
    undefined,
    undefined,
    undefined
  );

  return found;
}

async function wireComponentReturnFile(
  filePath: string,
  options: {
    adapterName: string;
    providerImportPath?: string;
    providerComponentName?: string;
    localeHookImportPath: string;
    switcherImportPath: string;
    runtimeImportPath?: string;
    providerRuntimeImportPath?: string;
    requiredComponentNames: string[];
    allowSingleReturn?: boolean;
  }
): Promise<{ updated: boolean; devSwitcherInjected: boolean }> {
  const source = await readTextFile(filePath);
  const ast = parseModule(source, filePath);
  let matches = 0;
  let updated = false;
  let devSwitcherInjected = false;
  const hasExistingSwitcher = hasComponentUsage(ast, "GlobalyzeLanguageSwitcher");

  traverse(ast, {
    ReturnStatement(path) {
      const argument = path.node.argument;

      if (!argument || (!t.isJSXElement(argument) && !t.isJSXFragment(argument))) {
        return;
      }

      const hasRequiredMarker = options.requiredComponentNames.some((name) =>
        containsJsxComponentName(argument, name)
      );

      if (!hasRequiredMarker && !options.allowSingleReturn) {
        return;
      }

      matches += 1;
      const applicationRoot =
        !hasExistingSwitcher
          ? appendDevSwitcherWithinTree(argument)
          : argument;

      if (!hasExistingSwitcher) {
        devSwitcherInjected = true;
      }

      const children: (t.JSXElement | t.JSXFragment | t.JSXExpressionContainer)[] = [
        buildWrappedApplication(
          applicationRoot,
          {
            adapterName: options.adapterName,
            providerComponentName: options.providerComponentName,
            wrapWithLocaleProvider: requiresGeneratedLocaleProvider(options.adapterName),
            includeInitialLocale:
              options.adapterName === "generic" || options.adapterName === "custom",
            resolveProviderLocaleAtRuntime: Boolean(options.providerRuntimeImportPath),
            resolveProviderMessagesAtRuntime: Boolean(options.providerRuntimeImportPath)
          }
        )
      ];

      path.node.argument = t.jsxFragment(
        t.jsxOpeningFragment(),
        t.jsxClosingFragment(),
        children
      );
      updated = true;
      path.stop();
    }
  });

  if (matches !== 1) {
    return { updated: false, devSwitcherInjected: false };
  }

  if (options.providerImportPath && options.providerComponentName) {
    ensureImport(ast, options.providerImportPath, options.providerComponentName);
  }

  if (requiresGeneratedLocaleProvider(options.adapterName)) {
    ensureImport(ast, options.localeHookImportPath, "GlobalyzeLocaleProvider");
  }
  if (options.runtimeImportPath) {
    ensureImport(ast, options.runtimeImportPath, "getCurrentLocale");
  }
  if (options.providerRuntimeImportPath) {
    ensureImport(ast, options.providerRuntimeImportPath, "getCurrentLocale");
    ensureImport(ast, options.providerRuntimeImportPath, "getCurrentMessages");
  }

  ensureImport(ast, options.switcherImportPath, "GlobalyzeLanguageSwitcher");

  const output = generate(ast, { retainLines: true }, source);
  await writeTextFile(
    filePath,
    await formatGeneratedFileContents(filePath, `${output.code}\n`)
  );
  return { updated, devSwitcherInjected };
}

async function wireNextAppRouterLayout(
  filePath: string,
  options: {
    adapterName: string;
    providerImportPath?: string;
    providerComponentName?: string;
    localeHookImportPath: string;
    switcherImportPath: string;
    runtimeImportPath?: string;
    providerRuntimeImportPath?: string;
  }
): Promise<{ updated: boolean; devSwitcherInjected: boolean }> {
  const source = await readTextFile(filePath);
  const ast = parseModule(source, filePath);
  let matchedBodies = 0;
  let updated = false;
  let devSwitcherInjected = false;
  const hasExistingSwitcher = hasComponentUsage(ast, "GlobalyzeLanguageSwitcher");
  const hasExistingLocaleProvider = hasComponentUsage(
    ast,
    "GlobalyzeLocaleProvider"
  );
  const hasExistingAdapterProvider =
    options.providerComponentName
      ? hasComponentUsage(ast, options.providerComponentName)
      : false;

  traverse(ast, {
    JSXElement(path) {
      if (!t.isJSXIdentifier(path.node.openingElement.name, { name: "body" })) {
        return;
      }

      if (
        hasExistingLocaleProvider ||
        hasExistingAdapterProvider ||
        path.node.children.length === 0
      ) {
        return;
      }

      matchedBodies += 1;
      const bodyTree =
        !hasExistingSwitcher
          ? t.jsxFragment(
              t.jsxOpeningFragment(),
              t.jsxClosingFragment(),
              [...path.node.children, buildDevSwitcherElement()]
            )
          : t.jsxFragment(
              t.jsxOpeningFragment(),
              t.jsxClosingFragment(),
              path.node.children
            );

      const wrappedChildren: (
        t.JSXElement | t.JSXFragment | t.JSXExpressionContainer
      )[] = [
        buildWrappedApplication(
          bodyTree,
          {
            adapterName: options.adapterName,
            providerComponentName: options.providerComponentName,
            wrapWithLocaleProvider: requiresGeneratedLocaleProvider(options.adapterName),
            includeInitialLocale:
              options.adapterName === "generic" || options.adapterName === "custom",
            resolveProviderLocaleAtRuntime: Boolean(options.providerRuntimeImportPath),
            resolveProviderMessagesAtRuntime: Boolean(options.providerRuntimeImportPath)
          }
        )
      ];

      if (!hasExistingSwitcher) {
        devSwitcherInjected = true;
      }

      path.node.children = wrappedChildren;
      updated = true;
      path.stop();
    }
  });

  if (matchedBodies !== 1) {
    return { updated: false, devSwitcherInjected: false };
  }

  if (options.providerImportPath && options.providerComponentName) {
    ensureImport(ast, options.providerImportPath, options.providerComponentName);
  }

  if (requiresGeneratedLocaleProvider(options.adapterName)) {
    ensureImport(ast, options.localeHookImportPath, "GlobalyzeLocaleProvider");
  }
  if (options.runtimeImportPath) {
    ensureImport(ast, options.runtimeImportPath, "getCurrentLocale");
  }
  if (options.providerRuntimeImportPath) {
    ensureImport(ast, options.providerRuntimeImportPath, "getCurrentLocale");
    ensureImport(ast, options.providerRuntimeImportPath, "getCurrentMessages");
  }

  ensureImport(ast, options.switcherImportPath, "GlobalyzeLanguageSwitcher");

  const output = generate(ast, { retainLines: true }, source);
  await writeTextFile(
    filePath,
    await formatGeneratedFileContents(filePath, `${output.code}\n`)
  );
  return { updated, devSwitcherInjected };
}

async function wireViteEntry(
  filePath: string,
  options: {
    adapterName: string;
    providerImportPath?: string;
    providerComponentName?: string;
    localeHookImportPath: string;
    switcherImportPath: string;
    runtimeImportPath?: string;
    providerRuntimeImportPath?: string;
  }
): Promise<{ updated: boolean; devSwitcherInjected: boolean }> {
  const source = await readTextFile(filePath);
  const ast = parseModule(source, filePath);
  let renderCalls = 0;
  let updated = false;
  let devSwitcherInjected = false;
  const hasExistingSwitcher = hasComponentUsage(ast, "GlobalyzeLanguageSwitcher");

  traverse(ast, {
    CallExpression(path) {
      if (
        !t.isMemberExpression(path.node.callee) ||
        !t.isIdentifier(path.node.callee.property, { name: "render" })
      ) {
        return;
      }

      const [firstArgument] = path.node.arguments;

      if (
        !firstArgument ||
        (!t.isJSXElement(firstArgument) && !t.isJSXFragment(firstArgument))
      ) {
        return;
      }

      renderCalls += 1;
      const applicationRoot =
        !hasExistingSwitcher
          ? appendDevSwitcherWithinTree(firstArgument)
          : firstArgument;

      if (!hasExistingSwitcher) {
        devSwitcherInjected = true;
      }

      const fragmentChildren: (
        t.JSXElement | t.JSXFragment | t.JSXExpressionContainer
      )[] = [
        buildWrappedApplication(
          applicationRoot,
          {
            adapterName: options.adapterName,
            providerComponentName: options.providerComponentName,
            wrapWithLocaleProvider: requiresGeneratedLocaleProvider(options.adapterName),
            includeInitialLocale:
              options.adapterName === "generic" || options.adapterName === "custom"
          }
        )
      ];

      path.node.arguments[0] = t.jsxFragment(
        t.jsxOpeningFragment(),
        t.jsxClosingFragment(),
        fragmentChildren
      );
      updated = true;
      path.stop();
    }
  });

  if (renderCalls !== 1) {
    return { updated: false, devSwitcherInjected: false };
  }

  if (options.providerImportPath && options.providerComponentName) {
    ensureImport(ast, options.providerImportPath, options.providerComponentName);
  }

  if (requiresGeneratedLocaleProvider(options.adapterName)) {
    ensureImport(ast, options.localeHookImportPath, "GlobalyzeLocaleProvider");
  }
  if (options.runtimeImportPath) {
    ensureImport(ast, options.runtimeImportPath, "getCurrentLocale");
  }
  if (options.providerRuntimeImportPath) {
    ensureImport(ast, options.providerRuntimeImportPath, "getCurrentLocale");
    ensureImport(ast, options.providerRuntimeImportPath, "getCurrentMessages");
  }

  ensureImport(ast, options.switcherImportPath, "GlobalyzeLanguageSwitcher");

  const output = generate(ast, { retainLines: true }, source);
  await writeTextFile(
    filePath,
    await formatGeneratedFileContents(filePath, `${output.code}\n`)
  );
  return { updated, devSwitcherInjected };
}

function buildGuidanceContents(
  config: ResolvedGlobalyzeConfig,
  packageManager: DetectedPackageManager,
  framework: DetectedFramework,
  entry: RuntimeEntryCandidate | null,
  skippedReason: string,
  paths: {
    languageSwitcherPath: string;
    localeHookPath: string;
    languageLabelsPath: string;
  }
): string {
  const adapter = resolveI18nAdapter(config);
  const installCommand =
    adapter.dependencyPackages.length > 0
      ? `${packageManager.installCommand} ${adapter.dependencyPackages.join(" ")}`
      : null;
  const runtimeFiles = [
    "`src/lib/i18n/translations.generated.ts` if it exists",
    "`src/i18n/runtime.ts` or `src/i18n/runtime.js` if generated",
    "`src/i18n/useLocale.ts` or `src/i18n/useLocale.tsx` if generated",
    "`src/components/GlobalyzeLanguageSwitcher.tsx` if generated",
    "`src/runtime/languageLabels.ts` if generated"
  ];

  return [
    "# Globalyze Runtime Integration",
    "",
    "Globalyze skipped automatic runtime wiring because the detected runtime entry could not be updated safely. Use this guide to complete the integration manually.",
    "",
    "## Detected setup",
    "",
    `- Adapter: \`${adapter.name}\``,
    `- Framework: \`${framework}\``,
    `- Entry file: \`${entry?.label ?? "not detected"}\``,
    `- Source locale: \`${config.sourceLocale}\``,
    `- Languages: ${config.languages.map((language) => `\`${language}\``).join(", ")}`,
    `- Locale structure: \`${config.localeStructure.structure}\` \`${config.localeStructure.format}\` split by \`${config.localeStructure.splitStrategy}\``,
    "",
    `Automatic wiring was skipped: ${skippedReason}`,
    "",
    "## Generated files to reuse",
    "",
    ...runtimeFiles.map((file) => `- ${file}`),
    "",
    "Do not create a separate hand-written locale manifest if `translations.generated.ts` already exists. Reuse the generated files so future `globalyze sync` and `globalyze style` runs remain compatible.",
    "",
    "## 1. Install adapter",
    installCommand
      ? `Run \`${installCommand}\``
      : "No adapter package install is required for this configuration.",
    "",
    "## 2. Add provider",
    adapter.providerComponentName && adapter.providerImportPath
      ? `Wrap your app with \`${adapter.providerComponentName}\` from \`${adapter.providerImportPath}\`.`
      : "Connect the generated GlobalyzeLocaleProvider to your runtime if you need locale state.",
    "",
    "## 3. Load locale files",
    "Use the generated locale manifest or generated locale modules as the runtime source of messages for the active locale.",
    "Prefer `translations.generated.ts` if present, because it is refreshed by Globalyze after locale structure changes.",
    "",
    "## 4. Keep translations reactive",
    "Client-visible text that should change immediately after a locale switch should use the generated locale hook / translation hook rather than a static top-level `t()` import.",
    "",
    "## 5. Add a language switcher",
    `Switcher component: \`${path.relative(config.rootDir, paths.languageSwitcherPath)}\``,
    `Locale hook: \`${path.relative(config.rootDir, paths.localeHookPath)}\``,
    `Language labels: \`${path.relative(config.rootDir, paths.languageLabelsPath)}\``,
    "",
    "Place `GlobalyzeLanguageSwitcher` in a visible part of the UI such as a sidebar footer, top bar, or preferences panel.",
    "",
    "## 6. Validate the runtime integration",
    "",
    "- Switch languages in the UI and confirm translated client text updates immediately.",
    "- Refresh the page and confirm the chosen locale persists if persistence was added.",
    "- Confirm the app still resolves locale files correctly after the latest `globalyze style` or `globalyze sync` run.",
    "- If the document language is managed at runtime, confirm the `html[lang]` value changes with the active locale.",
    "",
    "## 7. If you are an AI agent completing this task",
    "",
    "- Read the existing runtime files before editing anything.",
    "- Reuse generated files instead of building a parallel i18n architecture.",
    "- Prefer `useLocale()` and `useTranslation()` patterns for reactive client UI.",
    "- Do not manually enumerate locale imports if `translations.generated.ts` already exists.",
    "- Keep the result compatible with future `globalyze sync` and `globalyze style` runs.",
    ""
  ].join("\n");
}

export async function writeRuntimeGuidance(
  config: ResolvedGlobalyzeConfig,
  packageManager: DetectedPackageManager,
  framework: DetectedFramework,
  skippedReason: string,
  entry?: RuntimeEntryCandidate | null
): Promise<{
  guidancePath: string;
  languageSwitcherPath: string;
  localeHookPath: string;
  languageLabelsPath: string;
  createdArtifacts: string[];
  skippedArtifacts: string[];
}> {
  const artifacts = await ensureLanguageArtifacts(config);
  const guidancePath = path.join(config.rootDir, "globalyze.runtime.md");
  const contents = buildGuidanceContents(
    config,
    packageManager,
    framework,
    entry ?? null,
    skippedReason,
    {
      languageSwitcherPath: artifacts.switcherPath,
      localeHookPath: artifacts.localeHookPath,
      languageLabelsPath: artifacts.labelsPath
    }
  );
  await writeTextFile(guidancePath, contents);

  return {
    guidancePath,
    languageSwitcherPath: artifacts.switcherPath,
    localeHookPath: artifacts.localeHookPath,
    languageLabelsPath: artifacts.labelsPath,
    createdArtifacts: artifacts.created,
    skippedArtifacts: artifacts.skipped
  };
}

export async function setupRuntimeProvider(
  config: ResolvedGlobalyzeConfig,
  packageManager: DetectedPackageManager,
  options: {
    confirmWiring?: boolean;
  } = {}
): Promise<RuntimeWiringResult> {
  const adapter = resolveI18nAdapter(config);
  const preview = await inspectRuntimeProviderTarget(config);
  const framework = preview.framework;
  const artifacts = await ensureLanguageArtifacts(config);

  if (preview.alreadyWired) {
    return {
      framework,
      entryFile: preview.entryFile,
      wired: false,
      alreadyWired: true,
      skippedReason: preview.skippedReason,
      languageSwitcherPath: artifacts.switcherPath,
      localeHookPath: artifacts.localeHookPath,
      languageLabelsPath: artifacts.labelsPath,
      createdArtifacts: artifacts.created,
      skippedArtifacts: artifacts.skipped,
      devSwitcherInjected: false
    };
  }

  if (!preview.canAutoWire) {
    const guidance = await writeRuntimeGuidance(
      config,
      packageManager,
      framework,
      preview.skippedReason ?? "Automatic runtime wiring was skipped."
    );

    return {
      framework,
      wired: false,
      guidancePath: guidance.guidancePath,
      skippedReason: preview.skippedReason,
      languageSwitcherPath: guidance.languageSwitcherPath,
      localeHookPath: guidance.localeHookPath,
      languageLabelsPath: guidance.languageLabelsPath,
      createdArtifacts: guidance.createdArtifacts,
      skippedArtifacts: guidance.skippedArtifacts,
      devSwitcherInjected: false
    };
  }

  const entry = await detectRuntimeEntry(config.rootDir, framework);

  if (!entry) {
    throw new GlobalyzeError("Runtime entry preview did not resolve an entry file.");
  }

  if (options.confirmWiring === false) {
    const guidance = await writeRuntimeGuidance(
      config,
      packageManager,
      framework,
      "Automatic provider wiring was skipped by the user.",
      entry
    );

    return {
      framework,
      entryFile: entry.filePath,
      wired: false,
      guidancePath: guidance.guidancePath,
      skippedReason: "Automatic provider wiring was skipped by the user.",
      languageSwitcherPath: guidance.languageSwitcherPath,
      localeHookPath: guidance.localeHookPath,
      languageLabelsPath: guidance.languageLabelsPath,
      createdArtifacts: guidance.createdArtifacts,
      skippedArtifacts: guidance.skippedArtifacts,
      devSwitcherInjected: false
    };
  }

  const providerOptions = {
    adapterName: adapter.name,
    providerImportPath: adapter.providerImportPath,
    providerComponentName: adapter.providerComponentName,
    localeHookImportPath: buildRelativeImportPath(
      entry.filePath,
      artifacts.localeHookPath
    ),
    providerRuntimeImportPath:
      (adapter.name === "next-intl" || adapter.name === "react-intl") &&
      framework !== "vite-react" &&
      framework !== "plain-react"
        ? buildRelativeImportPath(entry.filePath, artifacts.serverRuntimePath)
        : undefined,
    ...(adapter.name === "generic" || adapter.name === "custom"
      ? {
          runtimeImportPath: config.translationImportPath
        }
      : {}),
    switcherImportPath: buildRelativeImportPath(
      entry.filePath,
      artifacts.switcherPath
    )
  };

  const wiringResult =
    framework === "next-app-router"
      ? await wireNextAppRouterLayout(entry.filePath, providerOptions)
      : framework === "next-pages-router"
        ? await wireComponentReturnFile(entry.filePath, {
            ...providerOptions,
            requiredComponentNames: ["Component"]
          })
        : framework === "tanstack-start" || framework === "remix"
          ? await wireComponentReturnFile(entry.filePath, {
              ...providerOptions,
              requiredComponentNames: ["Outlet", "RouterProvider"],
              allowSingleReturn: true
            })
          : framework === "react-router" &&
              /(^|\/)(app|src)?\/?root\.(tsx|jsx|ts|js)$/.test(
                entry.filePath.replace(/\\/g, "/")
              )
            ? await wireComponentReturnFile(entry.filePath, {
                ...providerOptions,
                requiredComponentNames: ["Outlet", "RouterProvider"],
                allowSingleReturn: true
              })
          : await wireViteEntry(entry.filePath, providerOptions);

  if (!wiringResult.updated) {
    const guidance = await writeRuntimeGuidance(
      config,
      packageManager,
      framework,
      "Automatic provider wiring was not safe for the detected runtime entry.",
      entry
    );

    return {
      framework,
      entryFile: entry.filePath,
      wired: false,
      guidancePath: guidance.guidancePath,
      skippedReason:
        "Automatic provider wiring was not safe for the detected runtime entry.",
      languageSwitcherPath: guidance.languageSwitcherPath,
      localeHookPath: guidance.localeHookPath,
      languageLabelsPath: guidance.languageLabelsPath,
      createdArtifacts: guidance.createdArtifacts,
      skippedArtifacts: guidance.skippedArtifacts,
      devSwitcherInjected: false
    };
  }

  return {
    framework,
    entryFile: entry.filePath,
    wired: true,
    languageSwitcherPath: artifacts.switcherPath,
    localeHookPath: artifacts.localeHookPath,
    languageLabelsPath: artifacts.labelsPath,
    createdArtifacts: artifacts.created,
    skippedArtifacts: artifacts.skipped,
    devSwitcherInjected: wiringResult.devSwitcherInjected
  };
}
