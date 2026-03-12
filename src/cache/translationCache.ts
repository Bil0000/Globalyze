import path from "node:path";

import fs from "fs-extra";

import { ensureGlobalyzeState, getGlobalyzeStatePaths } from "../state/globalyzeState";
import { resolveGlobalyzeRootDir } from "../utils/fileUtils";

type TranslationCacheData = Record<string, Record<string, string>>;

function getCachePath(projectRoot?: string): string {
  return getGlobalyzeStatePaths(projectRoot).translationsCachePath;
}

function getLegacyCachePath(): string {
  return path.join(
    resolveGlobalyzeRootDir(),
    ".cache",
    "globalyze",
    "translations.json"
  );
}

export async function readTranslationCache(
  projectRoot?: string
): Promise<TranslationCacheData> {
  await ensureGlobalyzeState(projectRoot);
  const cachePath = getCachePath(projectRoot);

  if (await fs.pathExists(cachePath)) {
    const parsed = (await fs.readJson(cachePath)) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    return parsed as TranslationCacheData;
  }

  const legacyCachePath = getLegacyCachePath();

  if (!(await fs.pathExists(legacyCachePath))) {
    return {};
  }

  const parsed = (await fs.readJson(legacyCachePath)) as unknown;

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  return parsed as TranslationCacheData;
}

export async function writeTranslationCache(
  cache: TranslationCacheData,
  projectRoot?: string
): Promise<void> {
  await ensureGlobalyzeState(projectRoot);
  const cachePath = getCachePath(projectRoot);
  await fs.ensureDir(path.dirname(cachePath));
  await fs.writeJson(cachePath, cache, { spaces: 2 });
  await fs.remove(getLegacyCachePath());
}

export async function getCachedTranslations(
  sourceLocale: Record<string, string>,
  language: string,
  projectRoot?: string
): Promise<{ translations: Record<string, string>; hits: number }> {
  const cache = await readTranslationCache(projectRoot);
  const translations: Record<string, string> = {};
  let hits = 0;

  for (const [key, text] of Object.entries(sourceLocale)) {
    const cached = cache[text]?.[language];

    if (
      typeof cached === "string" &&
      cached.trim().length > 0 &&
      cached.trim() !== text.trim()
    ) {
      translations[key] = cached;
      hits += 1;
    }
  }

  return {
    translations,
    hits
  };
}

export async function storeCachedTranslations(
  sourceLocale: Record<string, string>,
  language: string,
  translatedLocale: Record<string, string>,
  projectRoot?: string
): Promise<number> {
  const cache = await readTranslationCache(projectRoot);
  let writes = 0;

  for (const [key, sourceText] of Object.entries(sourceLocale)) {
    const translated = translatedLocale[key];

    if (
      typeof translated !== "string" ||
      translated.trim().length === 0 ||
      translated.trim() === sourceText.trim()
    ) {
      continue;
    }

    cache[sourceText] = {
      ...(cache[sourceText] ?? {}),
      [language]: translated
    };
    writes += 1;
  }

  await writeTranslationCache(cache, projectRoot);
  return writes;
}
