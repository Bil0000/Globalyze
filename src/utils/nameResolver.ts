import path from "node:path";

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import type { ResolvedNameMetadata } from "../types";

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

export function resolvePageName(filePath: string): string | null {
  const normalized = toPosix(filePath);
  const segments = normalized.split("/").filter(Boolean);
  const pagesIndex = segments.lastIndexOf("pages");
  const appIndex = segments.lastIndexOf("app");
  const routesIndex = segments.lastIndexOf("routes");

  if (pagesIndex >= 0) {
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
    const relevant = normalizeSegments(segments.slice(appIndex + 1));
    const filtered = relevant.filter(
      (segment) => segment !== "page" && segment !== "layout"
    );

    return filtered.at(-1) ?? "home";
  }

  if (routesIndex >= 0) {
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
      : camelCase(path.basename(filePath))
  };
}
