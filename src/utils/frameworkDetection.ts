import path from "node:path";

import fs from "fs-extra";

import type { DetectedFramework } from "../types";

async function hasDependency(
  rootDir: string,
  dependencyName: string
): Promise<boolean> {
  const packageJsonPath = path.join(rootDir, "package.json");

  if (!(await fs.pathExists(packageJsonPath))) {
    return false;
  }

  const packageJson = (await fs.readJson(packageJsonPath)) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  return Boolean(
    packageJson.dependencies?.[dependencyName] ??
      packageJson.devDependencies?.[dependencyName]
  );
}

async function hasAnyPath(rootDir: string, candidates: readonly string[]): Promise<boolean> {
  for (const candidate of candidates) {
    if (await fs.pathExists(path.join(rootDir, candidate))) {
      return true;
    }
  }

  return false;
}

function hasRouteLikeRootStructure(rootDir: string): Promise<boolean> {
  return hasAnyPath(rootDir, [
    path.join("src", "routes"),
    "routes",
    path.join("src", "router"),
    "router",
    path.join("src", "app", "routes"),
    path.join("app", "routes")
  ]);
}

export async function detectFramework(rootDir: string): Promise<DetectedFramework> {
  const hasNext = await hasDependency(rootDir, "next");
  const hasTanStackStart = await hasDependency(rootDir, "@tanstack/start");
  const hasRemix =
    (await hasDependency(rootDir, "@remix-run/react")) ||
    (await hasDependency(rootDir, "@remix-run/dev"));
  const hasReactRouter =
    (await hasDependency(rootDir, "react-router-dom")) ||
    (await hasDependency(rootDir, "react-router")) ||
    (await hasDependency(rootDir, "@react-router/dev"));
  const hasVite = await hasDependency(rootDir, "vite");
  const hasReact = await hasDependency(rootDir, "react");

  if (
    hasNext &&
    (await hasAnyPath(rootDir, ["app", path.join("src", "app")]))
  ) {
    return "next-app-router";
  }

  if (
    hasNext &&
    (await hasAnyPath(rootDir, ["pages", path.join("src", "pages")]))
  ) {
    return "next-pages-router";
  }

  if (
    hasTanStackStart &&
    (await hasAnyPath(rootDir, [
      path.join("src", "routes"),
      "routes",
      path.join("src", "routes", "__root.tsx"),
      path.join("src", "routes", "__root.jsx"),
      path.join("src", "routes", "__root.ts"),
      path.join("src", "routes", "__root.js"),
      path.join("routes", "__root.tsx"),
      path.join("routes", "__root.jsx"),
      path.join("routes", "__root.ts"),
      path.join("routes", "__root.js"),
      path.join("src", "app", "__root.tsx"),
      path.join("src", "app", "__root.jsx"),
      path.join("app", "__root.tsx"),
      path.join("app", "__root.jsx")
    ]))
  ) {
    return "tanstack-start";
  }

  if (hasRemix && (await hasAnyPath(rootDir, ["app/root.tsx", "app/root.jsx"]))) {
    return "remix";
  }

  if (
    hasRemix &&
    (await hasAnyPath(rootDir, [
      "src/app/root.tsx",
      "src/app/root.jsx",
      "src/app/root.ts",
      "src/app/root.js"
    ]))
  ) {
    return "remix";
  }

  if (
    hasReact &&
    hasReactRouter &&
    (await hasAnyPath(rootDir, [
      "app/root.tsx",
      "app/root.jsx",
      "app/root.ts",
      "app/root.js",
      "src/root.tsx",
      "src/root.jsx",
      "src/root.ts",
      "src/root.js",
      "root.tsx",
      "root.jsx",
      "root.ts",
      "root.js",
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
      "src/main.tsx",
      "src/main.jsx",
      "src/main.ts",
      "src/main.js",
      "src/index.tsx",
      "src/index.jsx",
      "src/index.ts",
      "src/index.js"
    ]))
  ) {
    return "react-router";
  }

  if (hasReact && hasReactRouter && (await hasRouteLikeRootStructure(rootDir))) {
    return "react-router";
  }

  if (hasVite && hasReact) {
    return "vite-react";
  }

  if (
    hasReact &&
    (await hasAnyPath(rootDir, [
      "src/main.ts",
      "src/main.tsx",
      "src/main.js",
      "src/main.jsx",
      "src/index.ts",
      "src/index.tsx",
      "src/index.js",
      "src/index.jsx"
    ]))
  ) {
    return "plain-react";
  }

  return "unknown";
}
