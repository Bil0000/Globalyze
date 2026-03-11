import path from "node:path";

import fs from "fs-extra";

import type { LocaleUnresolvedOwnershipStrategy } from "../types";

export interface GlobalyzeStatePaths {
  rootDir: string;
  stateDir: string;
  translationGraphPath: string;
  translationsCachePath: string;
  projectStatePath: string;
  extractionCachePath: string;
}

export interface GlobalyzeProjectState {
  projectRoot?: string;
  unresolvedOwnership?: Record<string, LocaleUnresolvedOwnershipStrategy>;
}

export function getGlobalyzeStatePaths(projectRoot?: string): GlobalyzeStatePaths {
  const rootDir = path.resolve(projectRoot ?? process.cwd());
  const stateDir = path.join(rootDir, ".globalyze");

  return {
    rootDir,
    stateDir,
    translationGraphPath: path.join(stateDir, "translationGraph.json"),
    translationsCachePath: path.join(stateDir, "translations.json"),
    projectStatePath: path.join(stateDir, "projectState.json"),
    extractionCachePath: path.join(stateDir, "extractionCache.json")
  };
}

export async function ensureGlobalyzeState(
  projectRoot?: string
): Promise<GlobalyzeStatePaths> {
  const paths = getGlobalyzeStatePaths(projectRoot);

  await fs.ensureDir(paths.stateDir);

  if (!(await fs.pathExists(paths.translationGraphPath))) {
    await fs.writeJson(paths.translationGraphPath, {}, { spaces: 2 });
  }

  if (!(await fs.pathExists(paths.translationsCachePath))) {
    await fs.writeJson(paths.translationsCachePath, {}, { spaces: 2 });
  }

  if (!(await fs.pathExists(paths.projectStatePath))) {
    await fs.writeJson(paths.projectStatePath, {}, { spaces: 2 });
  }

  if (!(await fs.pathExists(paths.extractionCachePath))) {
    await fs.writeJson(paths.extractionCachePath, { version: 1, files: {} }, { spaces: 2 });
  }

  return paths;
}

export async function readGlobalyzeProjectState(
  projectRoot?: string
): Promise<GlobalyzeProjectState> {
  const paths = await ensureGlobalyzeState(projectRoot);
  const parsed = (await fs.readJson(paths.projectStatePath)) as unknown;

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  return parsed as GlobalyzeProjectState;
}

export async function writeGlobalyzeProjectState(
  state: GlobalyzeProjectState,
  projectRoot?: string
): Promise<void> {
  const paths = await ensureGlobalyzeState(projectRoot);
  await fs.writeJson(paths.projectStatePath, state, { spaces: 2 });
}
