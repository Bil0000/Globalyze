import path from "node:path";
import { homedir } from "node:os";

import fs from "fs-extra";

const DEFAULT_REPOSITORY = "Bil0000/Globalyze";
const DEFAULT_BRANCH = "main";
const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 12;
const REMOTE_PACKAGE_URL = `https://raw.githubusercontent.com/${DEFAULT_REPOSITORY}/${DEFAULT_BRANCH}/package.json`;
const RELEASES_API_URL = `https://api.github.com/repos/${DEFAULT_REPOSITORY}/releases/latest`;
const COMMITS_API_URL = `https://api.github.com/repos/${DEFAULT_REPOSITORY}/commits?per_page=5`;

export interface UpdateReleaseInfo {
  source: "release" | "commits";
  title?: string;
  url?: string;
  summaryLines: string[];
}

export interface CliUpdateState {
  lastCheckedAt?: number;
  latestVersion?: string;
  releaseInfo?: UpdateReleaseInfo;
}

export interface UpdateCheckResult {
  checked: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  releaseInfo?: UpdateReleaseInfo;
}

function parseNumericVersion(version: string): number[] {
  const mainVersion = version.trim().split("-", 1)[0] ?? version.trim();
  return mainVersion
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseNumericVersion(left);
  const rightParts = parseNumericVersion(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

export function getCliStateDir(): string {
  const override = process.env.GLOBALYZE_CLI_STATE_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }

  return path.join(homedir(), ".globalyze");
}

function getCliStatePath(): string {
  return path.join(getCliStateDir(), "cli-state.json");
}

export async function readCliUpdateState(): Promise<CliUpdateState> {
  const statePath = getCliStatePath();

  if (!(await fs.pathExists(statePath))) {
    return {};
  }

  const parsed = (await fs.readJson(statePath)) as unknown;
  if (!isPlainObject(parsed)) {
    return {};
  }

  const lastCheckedAt =
    typeof parsed.lastCheckedAt === "number" ? parsed.lastCheckedAt : undefined;
  const latestVersion =
    typeof parsed.latestVersion === "string" && parsed.latestVersion.trim().length > 0
      ? parsed.latestVersion.trim()
      : undefined;
  const releaseInfo = normalizeReleaseInfo(parsed.releaseInfo);

  return {
    lastCheckedAt,
    latestVersion,
    releaseInfo
  };
}

export async function writeCliUpdateState(state: CliUpdateState): Promise<void> {
  const stateDir = getCliStateDir();
  const statePath = getCliStatePath();
  await fs.ensureDir(stateDir);
  await fs.writeJson(statePath, state, { spaces: 2 });
}

function normalizeReleaseInfo(value: unknown): UpdateReleaseInfo | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  if (value.source !== "release" && value.source !== "commits") {
    return undefined;
  }

  const summaryLines = Array.isArray(value.summaryLines)
    ? value.summaryLines
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  if (summaryLines.length === 0) {
    return undefined;
  }

  return {
    source: value.source,
    title: typeof value.title === "string" && value.title.trim().length > 0 ? value.title.trim() : undefined,
    url: typeof value.url === "string" && value.url.trim().length > 0 ? value.url.trim() : undefined,
    summaryLines
  };
}

export async function fetchLatestPublishedVersion(
  packageUrl: string = REMOTE_PACKAGE_URL
): Promise<string> {
  const response = await fetch(packageUrl, {
    headers: {
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(1500)
  });

  if (!response.ok) {
    throw new Error(`Version check failed with status ${String(response.status)}.`);
  }

  const parsed: unknown = await response.json();
  if (!isPlainObject(parsed) || typeof parsed.version !== "string" || parsed.version.trim().length === 0) {
    throw new Error("Remote package metadata did not include a valid version.");
  }

  return parsed.version.trim();
}

function extractSummaryLines(text: string, maxLines: number): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, maxLines);
}

export async function fetchLatestReleaseInfo(
  releaseUrl: string = RELEASES_API_URL
): Promise<UpdateReleaseInfo | undefined> {
  const response = await fetch(releaseUrl, {
    headers: {
      Accept: "application/vnd.github+json"
    },
    signal: AbortSignal.timeout(1500)
  });

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`Release lookup failed with status ${String(response.status)}.`);
  }

  const parsed: unknown = await response.json();
  if (!isPlainObject(parsed)) {
    return undefined;
  }

  const body = typeof parsed.body === "string" ? parsed.body : "";
  const summaryLines = extractSummaryLines(body, 3);
  if (summaryLines.length === 0) {
    return undefined;
  }

  return {
    source: "release",
    title:
      typeof parsed.name === "string" && parsed.name.trim().length > 0
        ? parsed.name.trim()
        : typeof parsed.tag_name === "string" && parsed.tag_name.trim().length > 0
          ? parsed.tag_name.trim()
          : undefined,
    url:
      typeof parsed.html_url === "string" && parsed.html_url.trim().length > 0
        ? parsed.html_url.trim()
        : undefined,
    summaryLines
  };
}

export async function fetchRecentCommitSummary(
  commitsUrl: string = COMMITS_API_URL
): Promise<UpdateReleaseInfo | undefined> {
  const response = await fetch(commitsUrl, {
    headers: {
      Accept: "application/vnd.github+json"
    },
    signal: AbortSignal.timeout(1500)
  });

  if (!response.ok) {
    throw new Error(`Commit lookup failed with status ${String(response.status)}.`);
  }

  const parsed: unknown = await response.json();
  if (!Array.isArray(parsed)) {
    return undefined;
  }

  const summaryLines = parsed
    .map((entry) => {
      if (!isPlainObject(entry) || !isPlainObject(entry.commit)) {
        return undefined;
      }

      const message =
        typeof entry.commit.message === "string" ? entry.commit.message.trim() : "";
      return message.length > 0 ? message.split(/\r?\n/, 1)[0] : undefined;
    })
    .filter((entry): entry is string => typeof entry === "string")
    .slice(0, 3);

  if (summaryLines.length === 0) {
    return undefined;
  }

  return {
    source: "commits",
    title: "Recent changes",
    url: `https://github.com/${DEFAULT_REPOSITORY}/commits/${DEFAULT_BRANCH}`,
    summaryLines
  };
}

export async function fetchUpdateReleaseInfo(
  options: {
    releaseUrl?: string;
    commitsUrl?: string;
  } = {}
): Promise<UpdateReleaseInfo | undefined> {
  try {
    const releaseInfo = await fetchLatestReleaseInfo(options.releaseUrl);
    if (releaseInfo) {
      return releaseInfo;
    }
  } catch {
    // Fall through to commit summary.
  }

  try {
    return await fetchRecentCommitSummary(options.commitsUrl);
  } catch {
    return undefined;
  }
}

export async function checkForCliUpdates(
  currentVersion: string,
  options: {
    force?: boolean;
    now?: number;
    packageUrl?: string;
    releaseUrl?: string;
    commitsUrl?: string;
  } = {}
): Promise<UpdateCheckResult> {
  const now = options.now ?? Date.now();
  const state = await readCliUpdateState();
  const shouldUseCache =
    options.force !== true &&
    typeof state.lastCheckedAt === "number" &&
    now - state.lastCheckedAt < UPDATE_CHECK_INTERVAL_MS &&
    typeof state.latestVersion === "string";

  const latestVersion = shouldUseCache
    ? state.latestVersion
    : await fetchLatestPublishedVersion(options.packageUrl);
  const releaseInfo =
    shouldUseCache && state.releaseInfo
      ? state.releaseInfo
      : typeof latestVersion === "string" && compareVersions(latestVersion, currentVersion) > 0
        ? await fetchUpdateReleaseInfo({
            releaseUrl: options.releaseUrl,
            commitsUrl: options.commitsUrl
          })
        : undefined;

  if (!shouldUseCache) {
    await writeCliUpdateState({
      lastCheckedAt: now,
      latestVersion,
      releaseInfo
    });
  }

  return {
    checked: !shouldUseCache,
    currentVersion,
    latestVersion,
    releaseInfo,
    updateAvailable:
      typeof latestVersion === "string" && compareVersions(latestVersion, currentVersion) > 0
  };
}

export function getDefaultUpdateInstallSource(): string {
  return process.env.GLOBALYZE_UPDATE_SOURCE?.trim() ?? `github:${DEFAULT_REPOSITORY}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
