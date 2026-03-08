import type {
  LocaleDictionary,
  LocaleEntryDictionary,
  LocaleKeyReference,
  ResolvedGlobalyzeConfig
} from "../../types";
import { JsMultiWriter } from "./JsMultiWriter";
import { JsSingleWriter } from "./JsSingleWriter";
import { JsonMultiWriter } from "./JsonMultiWriter";
import { JsonSingleWriter } from "./JsonSingleWriter";

interface LocaleWriter {
  readLanguage(config: ResolvedGlobalyzeConfig, language: string): Promise<LocaleDictionary>;
  readLanguageEntries(
    config: ResolvedGlobalyzeConfig,
    language: string
  ): Promise<LocaleEntryDictionary>;
  writeLanguage(
    config: ResolvedGlobalyzeConfig,
    language: string,
    locale: LocaleDictionary,
    sourceLocale: LocaleDictionary,
    assignments?: readonly LocaleKeyReference[]
  ): Promise<void>;
  writeLanguageEntries(
    config: ResolvedGlobalyzeConfig,
    language: string,
    locale: LocaleEntryDictionary,
    sourceLocale: LocaleEntryDictionary,
    assignments?: readonly LocaleKeyReference[]
  ): Promise<void>;
  removeStaleLanguages(
    config: ResolvedGlobalyzeConfig,
    activeLanguages: readonly string[]
  ): Promise<string[]>;
}

export function createLocaleWriter(config: ResolvedGlobalyzeConfig): LocaleWriter {
  if (config.localeStructure.format === "json") {
    return config.localeStructure.structure === "single"
      ? new JsonSingleWriter()
      : new JsonMultiWriter();
  }

  return config.localeStructure.structure === "single"
    ? new JsSingleWriter()
    : new JsMultiWriter();
}
