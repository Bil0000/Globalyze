import { LingoDotDevEngine } from "lingo.dev/sdk";

import {
  getCachedTranslations,
  storeCachedTranslations
} from "../cache/translationCache";
import type {
  LocaleDictionary,
  ResolvedGlobalyzeConfig,
  TranslationResult
} from "../types";
import { GlobalyzeError } from "../utils/errors";
import {
  ensureLocaleCoverageReady,
  readLocaleDictionary,
  writeLocaleDictionary
} from "../i18n/localeManager";
import { extractTranslationKeyReferencesFromFiles } from "../extractor/translationKeyExtractor";
import { scanProjectFiles } from "../scanner/projectScanner";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceTranslatedLocale(
  value: unknown,
  sourceLocale: LocaleDictionary
): LocaleDictionary {
  if (!isRecord(value)) {
    throw new GlobalyzeError("Lingo.dev returned an invalid locale payload.");
  }

  const output: LocaleDictionary = {};

  for (const [key, fallbackValue] of Object.entries(sourceLocale)) {
    const translatedValue = value[key];
    output[key] =
      typeof translatedValue === "string" && translatedValue.trim().length > 0
        ? translatedValue
        : fallbackValue;
  }

  return output;
}

function buildTranslationHints(
  sourceLocale: LocaleDictionary,
  translationInstructions: readonly string[]
): Record<string, string[]> | undefined {
  if (translationInstructions.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    Object.keys(sourceLocale).map((key) => [key, [...translationInstructions]])
  );
}

export async function translateLocales(
  config: ResolvedGlobalyzeConfig
): Promise<TranslationResult> {
  await ensureLocaleCoverageReady(config);
  const sourceLocale = await readLocaleDictionary(config, config.sourceLocale);
  const files = await scanProjectFiles(config);
  const sourceAssignments =
    files.length > 0
      ? await extractTranslationKeyReferencesFromFiles(
          files,
          config.translationFunctionName
        )
      : [];

  const targetLanguages = config.languages.filter(
    (language) => language !== config.sourceLocale
  );

  if (targetLanguages.length === 0) {
    return {
      translatedLocales: [],
      usedMockTranslations: false,
      skippedReason: "No target languages are configured."
    };
  }

  const apiKey = process.env.LINGO_API_KEY ?? process.env.LINGODOTDEV_API_KEY;

  if (!apiKey) {
    for (const language of targetLanguages) {
      await writeLocaleDictionary(
        config,
        language,
        sourceLocale,
        sourceAssignments
      );
    }

    return {
      translatedLocales: targetLanguages,
      usedMockTranslations: true,
      skippedReason:
        "LINGO_API_KEY is not set, so English source values were copied to target locales."
    };
  }

  process.env.DO_NOT_TRACK ??= "1";

  const engine = new LingoDotDevEngine({
    apiKey,
    ...(config.lingoApiUrl ? { baseUrl: config.lingoApiUrl } : {})
  });
  const fallbackWarnings: string[] = [];
  const hints = buildTranslationHints(
    sourceLocale,
    config.translationInstructions
  );
  let cacheHits = 0;
  let cacheWrites = 0;

  for (const language of targetLanguages) {
    try {
      const existingLocale = await readLocaleDictionary(config, language);
      const cached = config.cacheTranslations
        ? await getCachedTranslations(sourceLocale, language, config.rootDir)
        : { translations: {}, hits: 0 };
      cacheHits += cached.hits;
      const reusableTranslations = Object.fromEntries(
        Object.entries(sourceLocale).flatMap(([key]) => {
          const existingValue = existingLocale[key];

          return typeof existingValue === "string" && existingValue.trim().length > 0
            ? [[key, existingValue] as const]
            : [];
        })
      );
      const pendingSourceLocale = Object.fromEntries(
        Object.entries(sourceLocale).filter(
          ([key]) =>
            typeof cached.translations[key] !== "string" &&
            typeof reusableTranslations[key] !== "string"
        )
      );
      const translated =
        Object.keys(pendingSourceLocale).length > 0
          ? await engine.localizeObject(pendingSourceLocale, {
              sourceLocale: config.sourceLocale,
              targetLocale: language,
              ...(hints
                ? {
                    hints: Object.fromEntries(
                      Object.entries(hints).filter(([key]) => key in pendingSourceLocale)
                    )
                  }
                : {})
            })
          : {};
      const mergedTranslatedLocale = {
        ...reusableTranslations,
        ...cached.translations,
        ...coerceTranslatedLocale(translated, pendingSourceLocale)
      };

      await writeLocaleDictionary(
        config,
        language,
        coerceTranslatedLocale(mergedTranslatedLocale, sourceLocale),
        sourceAssignments
      );
      if (config.cacheTranslations) {
        cacheWrites += await storeCachedTranslations(
          sourceLocale,
          language,
          coerceTranslatedLocale(mergedTranslatedLocale, sourceLocale),
          config.rootDir
        );
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unknown translation failure";
      fallbackWarnings.push(
        `Lingo.dev translation failed for ${language}: ${reason}. English source values were copied instead.`
      );
      await writeLocaleDictionary(
        config,
        language,
        sourceLocale,
        sourceAssignments
      );
    }
  }

  return {
    translatedLocales: targetLanguages,
    usedMockTranslations: fallbackWarnings.length > 0,
    cacheHits,
    cacheWrites,
    ...(fallbackWarnings.length > 0
      ? { skippedReason: fallbackWarnings.join(" ") }
      : {})
  };
}
