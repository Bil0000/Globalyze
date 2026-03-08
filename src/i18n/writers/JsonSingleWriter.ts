import path from "node:path";

import type {
  LocaleDictionary,
  LocaleEntryDictionary,
  LocaleKeyReference,
  ResolvedGlobalyzeConfig
} from "../../types";
import {
  buildLocaleFileContents,
  readLanguageDirectory,
  readLanguageDirectoryEntries,
  removeStaleLanguageOutputs,
  writeLocaleFiles
} from "./shared";

export class JsonSingleWriter {
  async readLanguage(
    config: ResolvedGlobalyzeConfig,
    language: string
  ): Promise<LocaleDictionary> {
    return readLanguageDirectory(config, language);
  }

  async readLanguageEntries(
    config: ResolvedGlobalyzeConfig,
    language: string
  ): Promise<LocaleEntryDictionary> {
    return readLanguageDirectoryEntries(config, language);
  }

  async writeLanguage(
    config: ResolvedGlobalyzeConfig,
    language: string,
    locale: LocaleDictionary,
    sourceLocale: LocaleDictionary,
    assignments?: readonly LocaleKeyReference[]
  ): Promise<void> {
    await this.writeLanguageEntries(
      config,
      language,
      Object.fromEntries(
        Object.entries(locale).map(([key, value]) => [key, { value }])
      ),
      Object.fromEntries(
        Object.entries(sourceLocale).map(([key, value]) => [key, { value }])
      ),
      assignments
    );
  }

  async writeLanguageEntries(
    config: ResolvedGlobalyzeConfig,
    language: string,
    locale: LocaleEntryDictionary,
    sourceLocale: LocaleEntryDictionary,
    assignments?: readonly LocaleKeyReference[]
  ): Promise<void> {
    const files = buildLocaleFileContents(
      language,
      locale,
      sourceLocale,
      config.localeStructure,
      assignments,
      config.sourceLocale
    );

    await writeLocaleFiles(
      path.join(config.localesDir, language),
      files,
      config.localeStructure.format
    );
  }

  async removeStaleLanguages(
    config: ResolvedGlobalyzeConfig,
    activeLanguages: readonly string[]
  ): Promise<string[]> {
    return removeStaleLanguageOutputs(config, activeLanguages);
  }
}
