export type SupportedFileExtension = ".ts" | ".tsx" | ".js" | ".jsx";

export type ExtractedStringKind =
  | "jsx-text"
  | "jsx-expression-string"
  | "jsx-attribute";

export interface GlobalyzeConfig {
  sourceDir: string;
  localesDir: string;
  languages: string[];
  ignore?: string[];
  sourceLocale?: string;
  aiModel?: string;
  aiBatchSize?: number;
  translationImportPath?: string;
  translationFunctionName?: string;
  lingoApiUrl?: string;
}

export interface ResolvedGlobalyzeConfig {
  rootDir: string;
  sourceDir: string;
  localesDir: string;
  languages: string[];
  ignore: string[];
  sourceLocale: string;
  aiModel: string;
  aiBatchSize: number;
  translationImportPath: string;
  translationFunctionName: string;
  lingoApiUrl?: string;
}

export interface ExtractedString {
  text: string;
  file: string;
  line: number;
  column: number;
  kind: ExtractedStringKind;
  attributeName?: string;
}

export interface KeyGenerationCandidate {
  text: string;
  file: string;
}

export interface KeyAssignment extends KeyGenerationCandidate {
  key: string;
}

export interface KeyGenerationResult {
  keysByText: Map<string, string>;
  usedFallback: boolean;
}

export interface FileTransformResult {
  filePath: string;
  updated: boolean;
  replacements: number;
}

export interface ScanResult {
  files: string[];
  strings: ExtractedString[];
}

export type LocaleDictionary = Record<string, string>;

export interface LocaleSyncResult {
  created: string[];
  updated: string[];
}

export type MissingTranslationReport = Record<string, string[]>;

export interface TranslationResult {
  translatedLocales: string[];
  usedMockTranslations: boolean;
}

export interface TransformPipelineResult {
  files: string[];
  strings: ExtractedString[];
  keyAssignments: KeyAssignment[];
  transformedFiles: FileTransformResult[];
  localeSync: LocaleSyncResult;
  usedFallbackKeys: boolean;
}

export interface FullRunResult {
  transform: TransformPipelineResult;
  translation: TranslationResult;
}
