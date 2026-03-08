export type SupportedFileExtension = ".ts" | ".tsx" | ".js" | ".jsx";
export type LocaleFileFormat = "json" | "js";
export type LocaleFileStructure = "single" | "multiple";
export type LocaleSplitStrategy = "page" | "component";
export type LocaleFileNaming = "dot" | "camel" | "snake" | "kebab";

export interface LocaleStructureConfig {
  format: LocaleFileFormat;
  structure: LocaleFileStructure;
  splitStrategy: LocaleSplitStrategy;
  commonFile: boolean;
  naming: LocaleFileNaming;
}

export type BuiltInI18nAdapter =
  | "generic"
  | "react-i18next"
  | "next-intl"
  | "react-intl"
  | "custom";

export interface TranslationGovernanceConfig {
  enabled: boolean;
  failOnLockedChange: boolean;
  failOnApprovalRequiredChange: boolean;
}

export interface ResolvedNameMetadata {
  type: "page" | "component";
  name: string;
}

export type ExtractedStringKind =
  | "jsx-text"
  | "jsx-expression-string"
  | "jsx-attribute"
  | "jsx-dynamic";

export interface GlobalyzeConfig {
  sourceDir: string;
  localesDir: string;
  languages: string[];
  ignore?: string[];
  localeStructure?: Partial<LocaleStructureConfig>;
  cacheTranslations?: boolean;
  dynamicExtraction?: boolean;
  translationInstructions?: string[];
  i18nAdapter?: BuiltInI18nAdapter;
  sourceLocale?: string;
  openAiModel?: string;
  geminiModel?: string;
  aiBatchSize?: number;
  translationImportPath?: string;
  translationFunctionName?: string;
  translationHookName?: string;
  providerImportPath?: string;
  providerComponentName?: string;
  governance?: Partial<TranslationGovernanceConfig>;
  lingoApiUrl?: string;
}

export interface ResolvedGlobalyzeConfig {
  rootDir: string;
  sourceDir: string;
  localesDir: string;
  languages: string[];
  ignore: string[];
  localeStructure: LocaleStructureConfig;
  cacheTranslations: boolean;
  dynamicExtraction: boolean;
  translationInstructions: string[];
  i18nAdapter: BuiltInI18nAdapter;
  sourceLocale: string;
  openAiModel: string;
  geminiModel: string;
  aiBatchSize: number;
  translationImportPath: string;
  translationFunctionName: string;
  translationHookName?: string;
  providerImportPath?: string;
  providerComponentName?: string;
  governance: TranslationGovernanceConfig;
  lingoApiUrl?: string;
}

export interface ExtractedString {
  text: string;
  file: string;
  line: number;
  column: number;
  kind: ExtractedStringKind;
  attributeName?: string;
  componentName?: string;
  pageName?: string;
  pageNames?: string[];
  elementType?: string;
  interpolation?: Record<string, string>;
}

export interface KeyGenerationCandidate {
  text: string;
  file: string;
  componentName?: string;
  pageName?: string;
  pageNames?: string[];
  elementType?: string;
}

export interface KeyAssignment extends KeyGenerationCandidate {
  key: string;
}

export interface LocaleKeyReference {
  key: string;
  file: string;
  pageName?: string;
  pageNames?: string[];
  componentName?: string;
  sourceType?: "page" | "component";
}

export interface TranslationMetaEntry {
  value: string;
  owner?: string;
  locked?: boolean;
  approvalRequired?: boolean;
}

export interface DynamicExtractionCandidate {
  text: string;
  template: string;
  file: string;
  line: number;
  column: number;
  variables: Record<string, string>;
  componentName?: string;
  pageName?: string;
  pageNames?: string[];
  elementType?: string;
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

export type LocaleEntry = string | TranslationMetaEntry;
export type LocaleDictionary = Record<string, string>;
export type LocaleEntryDictionary = Record<string, TranslationMetaEntry>;

export interface LocaleFileContent {
  fileName: string;
  entries: LocaleEntryDictionary;
}

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
  cacheHits?: number;
  cacheWrites?: number;
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
  sourceAssignments: LocaleKeyReference[];
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
  sourceAssignments: LocaleKeyReference[];
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

export interface TranslationGraphEntry {
  text: string;
  originFile: string;
  localeFile: string;
  usages: string[];
  pageName?: string;
  pageNames?: string[];
  componentName?: string;
  sourceType?: "page" | "component";
  owner?: string;
  locked?: boolean;
  approvalRequired?: boolean;
}

export type TranslationGraph = Record<string, TranslationGraphEntry>;

export interface LocaleInspectionFile {
  fileName: string;
  filePath: string;
  entries: LocaleEntryDictionary;
}

export interface TranslationInspectionResult {
  key: string;
  value: string;
  originFile?: string;
  localeFile?: string;
  usages: string[];
  owner?: string;
  locked?: boolean;
  approvalRequired?: boolean;
}

export interface TranslationGraphSummary {
  totalKeys: number;
  totalPages: number;
  totalComponents: number;
  topPages: {
    name: string;
    count: number;
  }[];
  matchingKeys: string[];
}

export interface TranslationSearchMatch {
  key: string;
  value: string;
}

export interface LocalizationDoctorReport {
  totalKeys: number;
  unusedKeys: number;
  duplicateStrings: number;
  coverage: number;
  lockedKeysModified: number;
  approvalRequiredChanges: number;
  localeStructureLabel: string;
  languages: string[];
}

export interface DetectedLanguageResult {
  languages: string[];
  sources: string[];
}

export interface GovernanceChange {
  key: string;
  previousValue: string;
  nextValue: string;
  owner?: string;
  locked?: boolean;
  approvalRequired?: boolean;
}

export interface GovernanceEvaluationResult {
  changedKeys: GovernanceChange[];
  lockedViolations: GovernanceChange[];
  approvalRequiredChanges: GovernanceChange[];
  ownedChanges: GovernanceChange[];
}
