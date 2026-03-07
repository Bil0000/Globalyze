import { LingoDotDevEngine } from "lingo.dev/sdk";

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

export async function translateLocales(
  config: ResolvedGlobalyzeConfig
): Promise<TranslationResult> {
  await ensureLocaleCoverageReady(config);
  const sourceLocale = await readLocaleDictionary(config, config.sourceLocale);

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
      await writeLocaleDictionary(config, language, sourceLocale);
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

  for (const language of targetLanguages) {
    try {
      const translated = await engine.localizeObject(sourceLocale, {
        sourceLocale: config.sourceLocale,
        targetLocale: language
      });

      await writeLocaleDictionary(
        config,
        language,
        coerceTranslatedLocale(translated, sourceLocale)
      );
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unknown translation failure";
      fallbackWarnings.push(
        `Lingo.dev translation failed for ${language}: ${reason}. English source values were copied instead.`
      );
      await writeLocaleDictionary(config, language, sourceLocale);
    }
  }

  return {
    translatedLocales: targetLanguages,
    usedMockTranslations: fallbackWarnings.length > 0,
    ...(fallbackWarnings.length > 0
      ? { skippedReason: fallbackWarnings.join(" ") }
      : {})
  };
}
