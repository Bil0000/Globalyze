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
import { ensureLanguageArtifacts } from "./languageArtifacts";

interface RuntimeEntryCandidate {
  filePath: string;
  label: string;
}

export interface RuntimeWiringPreview {
  framework: DetectedFramework;
  entryFile?: string;
  canAutoWire: boolean;
  skippedReason?: string;
}

export interface RuntimeWiringResult {
  framework: DetectedFramework;
  entryFile?: string;
  wired: boolean;
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
  adapterName: string
): t.JSXAttribute[] | null {
  if (adapterName === "next-intl" || adapterName === "react-intl") {
    return [
      t.jsxAttribute(t.jsxIdentifier("locale"), t.stringLiteral("en")),
      t.jsxAttribute(
        t.jsxIdentifier("messages"),
        t.jsxExpressionContainer(t.objectExpression([]))
      )
    ];
  }

  return null;
}

function canAutoInjectAdapterProvider(adapterName: string): boolean {
  return buildProviderAttributes(adapterName) !== null;
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
  }
): t.JSXElement | t.JSXFragment {
  let wrapped: t.JSXElement | t.JSXFragment | t.JSXExpressionContainer = child;
  const providerAttributes = buildProviderAttributes(options.adapterName);

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
        [],
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
    "next-app-router": ["app/layout.tsx", "src/app/layout.tsx"],
    "next-pages-router": [],
    "tanstack-start": [],
    "vite-react": ["src/main.tsx", "src/main.jsx"],
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

  if (framework !== "next-app-router" && framework !== "vite-react") {
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

  return {
    framework,
    entryFile: entry.filePath,
    canAutoWire: true
  };
}

async function wireNextAppRouterLayout(
  filePath: string,
  options: {
    adapterName: string;
    providerImportPath?: string;
    providerComponentName?: string;
    localeHookImportPath: string;
    switcherImportPath: string;
  }
): Promise<{ updated: boolean; devSwitcherInjected: boolean }> {
  const source = await readTextFile(filePath);
  const ast = parseModule(source, filePath);
  let matchedChildren = 0;
  let updated = false;
  let devSwitcherInjected = false;
  const hasExistingSwitcher = hasComponentUsage(ast, "GlobalyzeLanguageSwitcher");

  traverse(ast, {
    JSXElement(path) {
      if (!t.isJSXIdentifier(path.node.openingElement.name, { name: "body" })) {
        return;
      }

      const childIndex = path.node.children.findIndex(
        (child) =>
          t.isJSXExpressionContainer(child) &&
          t.isIdentifier(child.expression, { name: "children" })
      );

      if (childIndex < 0) {
        return;
      }

      matchedChildren += 1;
      const bodyChild = path.node.children[childIndex];

      if (!bodyChild || !t.isJSXExpressionContainer(bodyChild)) {
        return;
      }

      const replacementChildren: (
        t.JSXElement | t.JSXFragment | t.JSXExpressionContainer
      )[] = [
        buildWrappedApplication(t.jsxExpressionContainer(t.identifier("children")), {
          adapterName: options.adapterName,
          providerComponentName: options.providerComponentName,
          wrapWithLocaleProvider: requiresGeneratedLocaleProvider(options.adapterName)
        })
      ];

      if (!hasExistingSwitcher) {
        replacementChildren.push(buildDevSwitcherElement());
        devSwitcherInjected = true;
      }

      path.node.children.splice(childIndex, 1, ...replacementChildren);
      updated = true;
      path.stop();
    }
  });

  if (matchedChildren !== 1) {
    return { updated: false, devSwitcherInjected: false };
  }

  if (options.providerImportPath && options.providerComponentName) {
    ensureImport(ast, options.providerImportPath, options.providerComponentName);
  }

  if (requiresGeneratedLocaleProvider(options.adapterName)) {
    ensureImport(ast, options.localeHookImportPath, "GlobalyzeLocaleProvider");
  }

  ensureImport(ast, options.switcherImportPath, "GlobalyzeLanguageSwitcher");

  const output = generate(ast, { retainLines: true }, source);
  await writeTextFile(filePath, `${output.code}\n`);
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
      const fragmentChildren: (
        t.JSXElement | t.JSXFragment | t.JSXExpressionContainer
      )[] = [
        buildWrappedApplication(firstArgument, {
          adapterName: options.adapterName,
          providerComponentName: options.providerComponentName,
          wrapWithLocaleProvider: requiresGeneratedLocaleProvider(options.adapterName)
        })
      ];

      if (!hasExistingSwitcher) {
        fragmentChildren.push(buildDevSwitcherElement());
        devSwitcherInjected = true;
      }

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

  ensureImport(ast, options.switcherImportPath, "GlobalyzeLanguageSwitcher");

  const output = generate(ast, { retainLines: true }, source);
  await writeTextFile(filePath, `${output.code}\n`);
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

  return [
    "# Globalyze Runtime Integration",
    "",
    `Adapter: ${adapter.name}`,
    `Framework: ${framework}`,
    `Entry file: ${entry?.label ?? "not detected"}`,
    "",
    `Automatic wiring was skipped: ${skippedReason}`,
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
    "Refresh or import the generated locale manifest used by your runtime integration.",
    "",
    "## 4. Add a language switcher",
    `Switcher component: \`${path.relative(config.rootDir, paths.languageSwitcherPath)}\``,
    `Locale hook: \`${path.relative(config.rootDir, paths.localeHookPath)}\``,
    `Language labels: \`${path.relative(config.rootDir, paths.languageLabelsPath)}\``,
    "",
    "## 5. Add a language switcher to your UI",
    'Import `GlobalyzeLanguageSwitcher` anywhere in your app or keep the dev-only floating switcher.',
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
    switcherImportPath: buildRelativeImportPath(
      entry.filePath,
      artifacts.switcherPath
    )
  };

  const wiringResult =
    framework === "next-app-router"
      ? await wireNextAppRouterLayout(entry.filePath, providerOptions)
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
