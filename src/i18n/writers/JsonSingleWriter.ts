import path from "node:path";

import type {
  LocaleDictionary,
  LocaleKeyReference,
  ResolvedGlobalyzeConfig
} from "../../types";
import {
  buildLocaleFileContents,
  readLanguageDirectory,
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

  async writeLanguage(
    config: ResolvedGlobalyzeConfig,
    language: string,
    locale: LocaleDictionary,
    sourceLocale: LocaleDictionary,
    assignments?: readonly LocaleKeyReference[]
  ): Promise<void> {
    const files = buildLocaleFileContents(
      language,
      locale,
      sourceLocale,
      config.localeStructure,
      assignments
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
