import path from "node:path";

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import ts from "typescript";

import type { ResolvedNameMetadata } from "../types";

const NON_ROUTE_SEGMENTS = new Set([
  "components",
  "component",
  "ui",
  "widgets",
  "tables",
  "hooks",
  "lib",
  "utils",
  "providers",
  "context"
]);

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep);
}

function slugify(value: string): string {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/\$(.+)$/g, "")
    .replace(/\[(.+?)\]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toLowerCase();
}

function camelCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment, index) =>
      index === 0
        ? segment.slice(0, 1).toLowerCase() + segment.slice(1)
        : segment.slice(0, 1).toUpperCase() + segment.slice(1)
    )
    .join("");
}

function normalizeSegments(segments: readonly string[]): string[] {
  return segments
    .map((segment) => slugify(segment))
    .filter((segment) => segment.length > 0 && segment !== "index");
}

function isLikelySupportPath(segments: readonly string[]): boolean {
  return segments.some((segment) => NON_ROUTE_SEGMENTS.has(slugify(segment)));
}

export function resolvePageName(filePath: string): string | null {
  const normalized = toPosix(filePath);
  const segments = normalized.split("/").filter(Boolean);
  const pagesIndex = segments.lastIndexOf("pages");
  const appIndex = segments.lastIndexOf("app");
  const routesIndex = segments.lastIndexOf("routes");
  const fileName = path.basename(normalized);
  const baseName = slugify(fileName);

  if (pagesIndex >= 0) {
    const routeSegments = segments.slice(pagesIndex + 1, -1);

    if (
      routeSegments[0] === "api" ||
      fileName.startsWith("_") ||
      isLikelySupportPath(routeSegments)
    ) {
      return null;
    }

    const relevant = normalizeSegments(segments.slice(pagesIndex + 1));

    if (relevant.length === 0) {
      return "home";
    }

    const last = relevant.at(-1);
    return last === "page" || last === "layout"
      ? relevant.at(-2) ?? "home"
      : last ?? "home";
  }

  if (appIndex >= 0) {
    if (routesIndex < 0) {
      if (!["page", "layout"].includes(baseName)) {
        return null;
      }

      const relevant = normalizeSegments(segments.slice(appIndex + 1));
      const filtered = relevant.filter(
        (segment) => segment !== "page" && segment !== "layout"
      );

      return filtered.at(-1) ?? "home";
    }
  }

  if (routesIndex >= 0) {
    const routeSegments = segments.slice(routesIndex + 1, -1);

    if (
      isLikelySupportPath(routeSegments) ||
      fileName === "routeTree.gen.ts" ||
      fileName === "routeTree.gen.tsx"
    ) {
      return null;
    }

    const relevant = normalizeSegments(segments.slice(routesIndex + 1));
    return relevant.at(-1) ?? "home";
  }

  return null;
}

export function resolveComponentName(
  filePath: string,
  source: string
): string {
  const ast = parse(source, {
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
  let name: string | null = null;

  traverse(ast, {
    ExportDefaultDeclaration(nodePath) {
      if (t.isFunctionDeclaration(nodePath.node.declaration) && nodePath.node.declaration.id) {
        name = camelCase(nodePath.node.declaration.id.name);
        nodePath.stop();
      }
    },
    VariableDeclarator(nodePath) {
      if (!t.isIdentifier(nodePath.node.id) || !nodePath.node.init) {
        return;
      }

      if (
        t.isArrowFunctionExpression(nodePath.node.init) ||
        t.isFunctionExpression(nodePath.node.init)
      ) {
        name = camelCase(nodePath.node.id.name);
      }
    }
  });

  if (typeof name === "string") {
    return name;
  }

  return camelCase(path.basename(filePath).replace(/\.[^.]+$/, ""));
}

export function resolveNameMetadata(
  filePath: string,
  source?: string
): ResolvedNameMetadata {
  const pageName = resolvePageName(filePath);

  if (pageName) {
    return {
      type: "page",
      name: pageName
    };
  }

  return {
    type: "component",
    name: source
      ? resolveComponentName(filePath, source)
      : camelCase(path.basename(filePath).replace(/\.[^.]+$/, ""))
  };
}

function toAbsolutePosix(filePath: string): string {
  return path.resolve(filePath).split(path.sep).join(path.posix.sep);
}

function parseImports(
  source: string
): string[] {
  const ast = parse(source, {
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
  const imports = new Set<string>();

  traverse(ast, {
    ImportDeclaration(nodePath) {
      if (typeof nodePath.node.source.value === "string") {
        imports.add(nodePath.node.source.value);
      }
    },
    ExportAllDeclaration(nodePath) {
      if (typeof nodePath.node.source.value === "string") {
        imports.add(nodePath.node.source.value);
      }
    },
    ExportNamedDeclaration(nodePath) {
      if (nodePath.node.source && typeof nodePath.node.source.value === "string") {
        imports.add(nodePath.node.source.value);
      }
    }
  });

  return [...imports];
}

function deriveSourceRoots(filePaths: readonly string[]): string[] {
  const roots = new Set<string>();

  for (const filePath of filePaths) {
    const segments = toAbsolutePosix(filePath).split("/");
    const sourceIndex = segments.lastIndexOf("src");

    if (sourceIndex >= 0) {
      roots.add(segments.slice(0, sourceIndex + 1).join("/") || "/");
    }
  }

  if (roots.size > 0) {
    return [...roots];
  }

  const directories = filePaths.map((filePath) => path.dirname(toAbsolutePosix(filePath)));
  const commonPrefix = directories.reduce((prefix, current) => {
    const prefixSegments = prefix.split("/");
    const currentSegments = current.split("/");
    const shared: string[] = [];

    for (
      let index = 0;
      index < Math.min(prefixSegments.length, currentSegments.length);
      index += 1
    ) {
      if (prefixSegments[index] !== currentSegments[index]) {
        break;
      }
      shared.push(prefixSegments[index] ?? "");
    }

    return shared.join("/") || "/";
  });

  return [commonPrefix];
}

function deriveProjectRoots(sourceRoots: readonly string[]): string[] {
  const roots = new Set<string>();

  for (const sourceRoot of sourceRoots) {
    roots.add(sourceRoot);
    roots.add(path.dirname(sourceRoot));
  }

  return [...roots];
}

function resolveTypeScriptImport(
  importerFile: string,
  specifier: string,
  knownFiles: Set<string>,
  compilerOptionsByConfigPath: Map<string, ts.CompilerOptions>,
  configPathByDirectory: Map<string, string | null>
): string | null {
  let currentDirectory = path.dirname(importerFile);
  let configPath: string | null | undefined = configPathByDirectory.get(currentDirectory);

  while (typeof configPath === "undefined") {
    const tsConfigPath = ts.findConfigFile(
      currentDirectory,
      (candidate) => ts.sys.fileExists(candidate),
      "tsconfig.json"
    );
    const jsConfigPath =
      tsConfigPath === undefined
        ? ts.findConfigFile(
            currentDirectory,
            (candidate) => ts.sys.fileExists(candidate),
            "jsconfig.json"
          )
        : undefined;

    configPath = tsConfigPath ?? jsConfigPath ?? null;
    configPathByDirectory.set(currentDirectory, configPath);

    if (configPath || currentDirectory === path.dirname(currentDirectory)) {
      break;
    }

    currentDirectory = path.dirname(currentDirectory);
    configPath = configPathByDirectory.get(currentDirectory);
  }

  if (!configPath) {
    return null;
  }

  let compilerOptions = compilerOptionsByConfigPath.get(configPath);

  if (!compilerOptions) {
    const parseHost: ts.ParseConfigFileHost = {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => undefined
    };
    const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, parseHost);

    if (!parsed) {
      return null;
    }

    compilerOptions = parsed.options;
    compilerOptionsByConfigPath.set(configPath, compilerOptions);
  }

  const resolved = ts.resolveModuleName(
    specifier,
    importerFile,
    compilerOptions,
    ts.sys
  ).resolvedModule?.resolvedFileName;

  if (!resolved) {
    return null;
  }

  const normalized = toAbsolutePosix(resolved);
  return knownFiles.has(normalized) ? normalized : null;
}

function resolveLocalImport(
  importerFile: string,
  specifier: string,
  knownFiles: Set<string>,
  sourceRoots: readonly string[],
  projectRoots: readonly string[],
  compilerOptionsByConfigPath: Map<string, ts.CompilerOptions>,
  configPathByDirectory: Map<string, string | null>
): string | null {
  const basePaths: string[] = [];

  if (specifier.startsWith(".")) {
    basePaths.push(path.resolve(path.dirname(importerFile), specifier));
  }

  if (specifier.startsWith("@/") || specifier.startsWith("~/")) {
    for (const sourceRoot of sourceRoots) {
      basePaths.push(path.resolve(sourceRoot, specifier.slice(2)));
    }
  }

  if (specifier.startsWith("src/")) {
    for (const projectRoot of projectRoots) {
      basePaths.push(path.resolve(projectRoot, specifier));
    }
  }

  if (!specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.includes(":")) {
    const typeScriptResolved = resolveTypeScriptImport(
      importerFile,
      specifier,
      knownFiles,
      compilerOptionsByConfigPath,
      configPathByDirectory
    );

    if (typeScriptResolved) {
      return typeScriptResolved;
    }

    for (const sourceRoot of sourceRoots) {
      basePaths.push(path.resolve(sourceRoot, specifier));
    }

    for (const projectRoot of projectRoots) {
      basePaths.push(path.resolve(projectRoot, specifier));
    }
  }

  if (basePaths.length === 0) {
    return null;
  }

  const candidates = basePaths
    .flatMap((basePath) => [
      basePath,
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.js`,
      `${basePath}.jsx`,
      path.join(basePath, "index.ts"),
      path.join(basePath, "index.tsx"),
      path.join(basePath, "index.js"),
      path.join(basePath, "index.jsx")
    ])
    .map((candidate) => toAbsolutePosix(candidate));

  return candidates.find((candidate) => knownFiles.has(candidate)) ?? null;
}

export interface ResolvedFileLocalizationMetadata {
  sourceType: "page" | "component";
  pageName?: string;
  pageNames?: string[];
  componentName?: string;
}

export async function buildFileLocalizationMetadata(
  filePaths: readonly string[]
): Promise<Map<string, ResolvedFileLocalizationMetadata>> {
  const normalizedFiles = filePaths.map((filePath) => toAbsolutePosix(filePath));
  const knownFiles = new Set(normalizedFiles);
  const sourceRoots = deriveSourceRoots(normalizedFiles);
  const projectRoots = deriveProjectRoots(sourceRoots);
  const dependencies = new Map<string, string[]>();
  const pageOwners = new Map<string, Set<string>>();
  const metadata = new Map<string, ResolvedFileLocalizationMetadata>();
  const compilerOptionsByConfigPath = new Map<string, ts.CompilerOptions>();
  const configPathByDirectory = new Map<string, string | null>();

  for (const filePath of normalizedFiles) {
    const source = await Bun.file(filePath).text();
    const pageName = resolvePageName(filePath);

    metadata.set(
      filePath,
      pageName
        ? {
            sourceType: "page",
            pageName
          }
        : {
            sourceType: "component",
            componentName: resolveComponentName(filePath, source)
          }
    );

    dependencies.set(
      filePath,
      parseImports(source)
        .map((specifier) =>
          resolveLocalImport(
            filePath,
            specifier,
            knownFiles,
            sourceRoots,
            projectRoots,
            compilerOptionsByConfigPath,
            configPathByDirectory
          )
        )
        .filter((resolved): resolved is string => resolved !== null)
    );
  }

  const pageFiles = [...metadata.entries()].flatMap(([filePath, value]) =>
    value.sourceType === "page" && typeof value.pageName === "string"
      ? [
          {
            filePath,
            pageName: value.pageName
          }
        ]
      : []
  );

  for (const pageFile of pageFiles) {
    const queue = [pageFile.filePath];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();

      if (!current || visited.has(current)) {
        continue;
      }

      visited.add(current);
      const owners = pageOwners.get(current) ?? new Set<string>();
      owners.add(pageFile.pageName);
      pageOwners.set(current, owners);

      for (const dependency of dependencies.get(current) ?? []) {
        if (!visited.has(dependency)) {
          queue.push(dependency);
        }
      }
    }
  }

  for (const [filePath, value] of metadata.entries()) {
    const owners = [...(pageOwners.get(filePath) ?? new Set<string>())];

    if (value.sourceType === "page") {
      continue;
    }

    if (owners.length === 1) {
      metadata.set(filePath, {
        ...value,
        pageName: owners[0],
        pageNames: owners
      });
      continue;
    }

    if (owners.length > 1) {
      metadata.set(filePath, {
        ...value,
        pageNames: owners.sort((left, right) => left.localeCompare(right))
      });
    }
  }

  return metadata;
}
