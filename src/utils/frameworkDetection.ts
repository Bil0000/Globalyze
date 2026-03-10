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

export async function detectFramework(rootDir: string): Promise<DetectedFramework> {
  const hasNext = await hasDependency(rootDir, "next");
  const hasTanStackStart = await hasDependency(rootDir, "@tanstack/start");
  const hasRemix =
    (await hasDependency(rootDir, "@remix-run/react")) ||
    (await hasDependency(rootDir, "@remix-run/dev"));
  const hasReactRouter = await hasDependency(rootDir, "react-router-dom");
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
    (await hasAnyPath(rootDir, [path.join("src", "routes"), "routes"]))
  ) {
    return "tanstack-start";
  }

  if (hasRemix && (await hasAnyPath(rootDir, ["app/root.tsx", "app/root.jsx"]))) {
    return "remix";
  }

  if (hasVite && hasReact) {
    return "vite-react";
  }

  if (
    hasReact &&
    hasReactRouter &&
    (await hasAnyPath(rootDir, [
      "src/main.tsx",
      "src/main.jsx",
      "src/index.tsx",
      "src/index.jsx"
    ]))
  ) {
    return "react-router";
  }

  if (
    hasReact &&
    (await hasAnyPath(rootDir, [
      "src/main.tsx",
      "src/main.jsx",
      "src/index.tsx",
      "src/index.jsx"
    ]))
  ) {
    return "plain-react";
  }

  return "unknown";
}
