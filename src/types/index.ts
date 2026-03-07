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
  fallbackReason?: string;
  reusedExistingKeys: number;
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
  removed: string[];
  sourceKeyCount: number;
}

export type MissingTranslationReport = Record<string, string[]>;

export interface TranslationResult {
  translatedLocales: string[];
  usedMockTranslations: boolean;
  skippedReason?: string;
}

export interface LanguageCoverageReport {
  code: string;
  coverage: number;
  missingKeys: string[];
  translatedKeys: number;
  totalKeys: number;
}

export interface TranslationCoverageReport {
  sourceLocale: string;
  totalKeys: number;
  languages: LanguageCoverageReport[];
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

export interface TransformPreparationResult {
  files: string[];
  rawStrings: ExtractedString[];
  keyAssignments: KeyAssignment[];
  keysByText: Map<string, string>;
  usedFallbackKeys: boolean;
  fallbackReason?: string;
  reusedExistingKeys: number;
}

export interface PreviewFileDiff {
  filePath: string;
  relativePath: string;
  before: string;
  after: string;
  diff: string;
  replacements: number;
}

export interface PreviewResult {
  files: PreviewFileDiff[];
  rawStrings: ExtractedString[];
  reusedExistingKeys: number;
  usedFallbackKeys: boolean;
  fallbackReason?: string;
}

export interface WatchUpdateResult {
  changedFiles: string[];
  newStrings: ExtractedString[];
  updatedFiles: FileTransformResult[];
  localeSync: LocaleSyncResult;
  translation?: TranslationResult;
  reusedExistingKeys: number;
  usedFallbackKeys: boolean;
  fallbackReason?: string;
}

export interface OcrScanResult {
  detectedText: string[];
  untranslatedText: string[];
}

export interface ProjectScoreSummary {
  coverage: number;
  hardcodedStrings: number;
  missingTranslations: number;
  unusedLocaleKeys: number;
  healthyLocales: boolean;
  grade: "A" | "B" | "C" | "D";
}
