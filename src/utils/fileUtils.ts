import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import dotenv from "dotenv";
import fs from "fs-extra";

import type {
  BuiltInI18nAdapter,
  GlobalyzeConfig,
  LocaleStructureConfig,
  LocaleDictionary,
  ResolvedGlobalyzeConfig,
  SupportedFileExtension,
  TranslationGovernanceConfig
} from "../types";
import { GlobalyzeError } from "./errors";

export const SUPPORTED_EXTENSIONS: readonly SupportedFileExtension[] = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx"
];

export const DEFAULT_IGNORE = [
  "node_modules",
  "dist",
  "build",
  ".next",
  ".git"
];

export const DEFAULT_LOCALE_STRUCTURE: LocaleStructureConfig = {
  format: "json",
  structure: "single",
  splitStrategy: "page",
  commonFile: false,
  naming: "dot"
};

const DEFAULT_CONFIG: Omit<ResolvedGlobalyzeConfig, "rootDir" | "sourceDir" | "localesDir"> =
  {
    languages: ["en"],
    ignore: DEFAULT_IGNORE,
    localeStructure: DEFAULT_LOCALE_STRUCTURE,
    cacheTranslations: true,
    dynamicExtraction: false,
    i18nAdapter: "generic",
    translationInstructions: [
      "This is a React application with user-facing UI text.",
      "Keep labels, actions, and short UI text concise and natural for the target locale.",
      "Do not translate brand names or product names unless they are already localized."
    ],
    sourceLocale: "en",
    openAiModel: "gpt-4o-mini",
    geminiModel: "gemini-2.5-flash-lite",
    aiBatchSize: 20,
    translationImportPath: "@/i18n",
    translationFunctionName: "t",
    translationHookName: undefined,
    providerImportPath: undefined,
    providerComponentName: undefined,
    governance: {
      enabled: false,
      failOnLockedChange: true,
      failOnApprovalRequiredChange: false
    },
    lingoApiUrl: undefined
  };

function formatGovernance(value: TranslationGovernanceConfig): string {
  return [
    "{",
    `    enabled: ${value.enabled ? "true" : "false"},`,
    `    failOnLockedChange: ${value.failOnLockedChange ? "true" : "false"},`,
    `    failOnApprovalRequiredChange: ${value.failOnApprovalRequiredChange ? "true" : "false"},`,
    "  }"
  ].join("\n");
}

function normalizeI18nAdapter(input: unknown): BuiltInI18nAdapter {
  return input === "react-i18next" ||
    input === "next-intl" ||
    input === "react-intl" ||
    input === "custom"
    ? input
    : "generic";
}

function normalizeGovernance(input: unknown): TranslationGovernanceConfig {
  if (!isPlainObject(input)) {
    return { ...DEFAULT_CONFIG.governance };
  }

  return {
    enabled:
      typeof input.enabled === "boolean"
        ? input.enabled
        : DEFAULT_CONFIG.governance.enabled,
    failOnLockedChange:
      typeof input.failOnLockedChange === "boolean"
        ? input.failOnLockedChange
        : DEFAULT_CONFIG.governance.failOnLockedChange,
    failOnApprovalRequiredChange:
      typeof input.failOnApprovalRequiredChange === "boolean"
        ? input.failOnApprovalRequiredChange
        : DEFAULT_CONFIG.governance.failOnApprovalRequiredChange
  };
}

function quoteString(value: string): string {
  return JSON.stringify(value);
}

function formatStringArray(values: readonly string[]): string {
  return `[${values.map((value) => quoteString(value)).join(", ")}]`;
}

function formatInstructionArray(values: readonly string[]): string {
  if (values.length === 0) {
    return "[]";
  }

  return [
    "[",
    ...values.map((value) => `    ${quoteString(value)},`),
    "  ]"
  ].join("\n");
}

function formatLocaleStructure(value: LocaleStructureConfig): string {
  return [
    "{",
    `    format: ${quoteString(value.format)},`,
    `    structure: ${quoteString(value.structure)},`,
    `    splitStrategy: ${quoteString(value.splitStrategy)},`,
    `    commonFile: ${value.commonFile ? "true" : "false"},`,
    `    naming: ${quoteString(value.naming)},`,
    "  }"
  ].join("\n");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLanguageList(input: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(input)) {
    return [...fallback];
  }

  const languages = input
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  return languages.length > 0 ? [...new Set(languages)] : [...fallback];
}

function normalizeStringList(input: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(input)) {
    return [...fallback];
  }

  const values = input
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length > 0 ? [...values] : [...fallback];
}

function isLocaleStructureConfig(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLocaleStructure(input: unknown): LocaleStructureConfig {
  if (!isLocaleStructureConfig(input)) {
    return { ...DEFAULT_LOCALE_STRUCTURE };
  }

  const format = input.format === "js" ? "js" : "json";
  const structure = input.structure === "multiple" ? "multiple" : "single";
  const splitStrategy =
    input.splitStrategy === "component" ? "component" : "page";
  const commonFile =
    structure === "multiple" ? input.commonFile !== false : false;
  const naming =
    input.naming === "camel"
      ? "camel"
      : input.naming === "snake"
        ? "snake"
        : input.naming === "kebab"
          ? "kebab"
          : "dot";

  return {
    format,
    structure,
    splitStrategy,
    commonFile,
    naming
  };
}

function resolveOptionalString(input: unknown, fallback: string): string {
  return typeof input === "string" && input.trim().length > 0
    ? input.trim()
    : fallback;
}

function assertOptionalString(
  fieldName: string,
  value: unknown,
  configPath: string
): void {
  if (value !== undefined && typeof value !== "string") {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "${fieldName}" value. Expected a string.`
    );
  }
}

function assertOptionalStringArray(
  fieldName: string,
  value: unknown,
  configPath: string
): void {
  if (value === undefined) {
    return;
  }

  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)
  ) {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "${fieldName}" value. Expected an array of non-empty strings.`
    );
  }
}

function assertOptionalPositiveNumber(
  fieldName: string,
  value: unknown,
  configPath: string
): void {
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
  ) {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "${fieldName}" value. Expected a positive number.`
    );
  }
}

function assertOptionalBoolean(
  fieldName: string,
  value: unknown,
  configPath: string
): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "${fieldName}" value. Expected a boolean.`
    );
  }
}

function assertOptionalGovernance(value: unknown, configPath: string): void {
  if (value === undefined) {
    return;
  }

  if (!isPlainObject(value)) {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "governance" value. Expected an object.`
    );
  }

  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "governance.enabled" value. Expected a boolean.`
    );
  }

  if (
    value.failOnLockedChange !== undefined &&
    typeof value.failOnLockedChange !== "boolean"
  ) {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "governance.failOnLockedChange" value. Expected a boolean.`
    );
  }

  if (
    value.failOnApprovalRequiredChange !== undefined &&
    typeof value.failOnApprovalRequiredChange !== "boolean"
  ) {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "governance.failOnApprovalRequiredChange" value. Expected a boolean.`
    );
  }
}

function assertOptionalAdapter(value: unknown, configPath: string): void {
  if (
    value !== undefined &&
    value !== "generic" &&
    value !== "react-i18next" &&
    value !== "next-intl" &&
    value !== "react-intl" &&
    value !== "custom"
  ) {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "i18nAdapter" value. Expected "generic", "react-i18next", "next-intl", "react-intl", or "custom".`
    );
  }
}

function assertOptionalLocaleStructure(
  value: unknown,
  configPath: string
): void {
  if (value === undefined) {
    return;
  }

  if (!isLocaleStructureConfig(value)) {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "localeStructure" value. Expected an object.`
    );
  }

  if (
    value.format !== undefined &&
    value.format !== "json" &&
    value.format !== "js"
  ) {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "localeStructure.format" value. Expected "json" or "js".`
    );
  }

  if (
    value.structure !== undefined &&
    value.structure !== "single" &&
    value.structure !== "multiple"
  ) {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "localeStructure.structure" value. Expected "single" or "multiple".`
    );
  }

  if (
    value.splitStrategy !== undefined &&
    value.splitStrategy !== "page" &&
    value.splitStrategy !== "component"
  ) {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "localeStructure.splitStrategy" value. Expected "page" or "component".`
    );
  }

  if (
    value.commonFile !== undefined &&
    typeof value.commonFile !== "boolean"
  ) {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "localeStructure.commonFile" value. Expected a boolean.`
    );
  }

  if (
    value.naming !== undefined &&
    value.naming !== "dot" &&
    value.naming !== "camel" &&
    value.naming !== "snake" &&
    value.naming !== "kebab"
  ) {
    throw new GlobalyzeError(
      `Config at ${configPath} has an invalid "localeStructure.naming" value. Expected "dot", "camel", "snake", or "kebab".`
    );
  }
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

export function toRelativePosixPath(from: string, target: string): string {
  return toPosixPath(path.relative(from, target));
}

export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function writeTextFile(
  filePath: string,
  contents: string
): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, "utf8");
}

export async function pathExists(filePath: string): Promise<boolean> {
  return fs.pathExists(filePath);
}

export async function readJsonFile(
  filePath: string
): Promise<LocaleDictionary | null> {
  if (!(await fs.pathExists(filePath))) {
    return null;
  }

  const contents = await fs.readFile(filePath, "utf8");
  let parsed: unknown;

  try {
    parsed = JSON.parse(contents) as unknown;
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unknown JSON parse failure";

    throw new GlobalyzeError(`Failed to parse JSON at ${filePath}: ${reason}`);
  }

  if (!isPlainObject(parsed)) {
    throw new GlobalyzeError(`Expected ${filePath} to contain a JSON object.`);
  }

  const dictionary: LocaleDictionary = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") {
      dictionary[key] = value;
    }
  }

  return dictionary;
}

export async function writeJsonFile(
  filePath: string,
  value: LocaleDictionary
) {
  await fs.ensureDir(path.dirname(filePath));
  const sorted = Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  );
  await fs.writeFile(filePath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

export function normalizeLanguageCodes(
  input: readonly string[],
  sourceLocale = DEFAULT_CONFIG.sourceLocale
): string[] {
  const languages = input
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const uniqueLanguages = [...new Set(languages)];

  if (!uniqueLanguages.includes(sourceLocale)) {
    uniqueLanguages.unshift(sourceLocale);
  }

  return uniqueLanguages;
}

export function createDefaultConfigContents(
  languages: readonly string[] = DEFAULT_CONFIG.languages,
  translationInstructions: readonly string[] = DEFAULT_CONFIG.translationInstructions,
  localeStructure: LocaleStructureConfig = DEFAULT_CONFIG.localeStructure,
  dynamicExtraction = DEFAULT_CONFIG.dynamicExtraction,
  i18nAdapter: BuiltInI18nAdapter = DEFAULT_CONFIG.i18nAdapter,
  governance: TranslationGovernanceConfig = DEFAULT_CONFIG.governance
): string {
  return [
    "export default {",
    '  sourceDir: "src",',
    '  localesDir: "locales",',
    `  languages: ${formatStringArray(languages)},`,
    `  ignore: ${formatStringArray(DEFAULT_IGNORE)},`,
    `  localeStructure: ${formatLocaleStructure(localeStructure)},`,
    `  cacheTranslations: ${DEFAULT_CONFIG.cacheTranslations ? "true" : "false"},`,
    `  dynamicExtraction: ${dynamicExtraction ? "true" : "false"},`,
    `  i18nAdapter: ${quoteString(i18nAdapter)},`,
    `  translationInstructions: ${formatInstructionArray(translationInstructions)},`,
    `  sourceLocale: ${quoteString(DEFAULT_CONFIG.sourceLocale)},`,
    `  openAiModel: ${quoteString(DEFAULT_CONFIG.openAiModel)},`,
    `  geminiModel: ${quoteString(DEFAULT_CONFIG.geminiModel)},`,
    `  aiBatchSize: ${String(DEFAULT_CONFIG.aiBatchSize)},`,
    `  translationImportPath: ${quoteString(DEFAULT_CONFIG.translationImportPath)},`,
    `  translationFunctionName: ${quoteString(DEFAULT_CONFIG.translationFunctionName)},`,
    `  governance: ${formatGovernance(governance)},`,
    "};",
    ""
  ].join("\n");
}

export function createConfigContents(
  config: Pick<
    ResolvedGlobalyzeConfig,
    | "rootDir"
    | "sourceDir"
    | "localesDir"
    | "languages"
    | "ignore"
    | "localeStructure"
    | "cacheTranslations"
    | "dynamicExtraction"
    | "i18nAdapter"
    | "translationInstructions"
    | "sourceLocale"
    | "openAiModel"
    | "geminiModel"
    | "aiBatchSize"
    | "translationImportPath"
    | "translationFunctionName"
    | "translationHookName"
    | "providerImportPath"
    | "providerComponentName"
    | "governance"
    | "lingoApiUrl"
  >
): string {
  const relativeSourceDir = toRelativePosixPath(config.rootDir, config.sourceDir);
  const relativeLocalesDir = toRelativePosixPath(config.rootDir, config.localesDir);
  const lines = [
    "export default {",
    `  sourceDir: ${quoteString(relativeSourceDir)},`,
    `  localesDir: ${quoteString(relativeLocalesDir)},`,
    `  languages: ${formatStringArray(config.languages)},`,
    `  ignore: ${formatStringArray(config.ignore)},`,
    `  localeStructure: ${formatLocaleStructure(config.localeStructure)},`,
    `  cacheTranslations: ${config.cacheTranslations ? "true" : "false"},`,
    `  dynamicExtraction: ${config.dynamicExtraction ? "true" : "false"},`,
    `  i18nAdapter: ${quoteString(config.i18nAdapter)},`,
    `  translationInstructions: ${formatInstructionArray(config.translationInstructions)},`,
    `  sourceLocale: ${quoteString(config.sourceLocale)},`,
    `  openAiModel: ${quoteString(config.openAiModel)},`,
    `  geminiModel: ${quoteString(config.geminiModel)},`,
    `  aiBatchSize: ${String(config.aiBatchSize)},`,
    `  translationImportPath: ${quoteString(config.translationImportPath)},`,
    `  translationFunctionName: ${quoteString(config.translationFunctionName)},`,
    ...(config.translationHookName
      ? [`  translationHookName: ${quoteString(config.translationHookName)},`]
      : []),
    ...(config.providerImportPath
      ? [`  providerImportPath: ${quoteString(config.providerImportPath)},`]
      : []),
    ...(config.providerComponentName
      ? [`  providerComponentName: ${quoteString(config.providerComponentName)},`]
      : []),
    `  governance: ${formatGovernance(config.governance)},`,
    ...(config.lingoApiUrl
      ? [`  lingoApiUrl: ${quoteString(config.lingoApiUrl)},`]
      : []),
    "};",
    ""
  ];

  return lines.join("\n");
}

export function resolveGlobalyzeRootDir(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    ".."
  );
}

function loadEnvFiles(rootDir: string): void {
  const envFiles = [".env", ".env.local"];

  for (const envFile of envFiles) {
    const envPath = path.join(rootDir, envFile);

    if (!fs.existsSync(envPath)) {
      continue;
    }

    const result = dotenv.config({
      path: envPath,
      override: false,
      quiet: true
    });

    if (result.error) {
      throw new GlobalyzeError(
        `Failed to load environment file at ${envPath}: ${result.error.message}`
      );
    }
  }
}

export async function loadGlobalyzeConfig(
  configPath = "globalyze.config.ts",
  overrides: Partial<GlobalyzeConfig> = {}
): Promise<ResolvedGlobalyzeConfig> {
  const resolvedConfigPath = path.resolve(process.cwd(), configPath);

  if (!(await fs.pathExists(resolvedConfigPath))) {
    throw new GlobalyzeError(
      `Missing config file at ${resolvedConfigPath}. Run "globalyze init" first.`
    );
  }

  const rootDir = path.dirname(resolvedConfigPath);
  loadEnvFiles(resolveGlobalyzeRootDir());

  let importedModule: { default?: unknown };

  try {
    importedModule = (await import(
      `${pathToFileURL(resolvedConfigPath).href}?v=${String(Date.now())}`
    )) as {
      default?: unknown;
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unknown config import failure";

    throw new GlobalyzeError(
      `Failed to load config at ${resolvedConfigPath}: ${reason}`
    );
  }

  if (importedModule.default === undefined) {
    throw new GlobalyzeError(
      `Config at ${resolvedConfigPath} must export a default object.`
    );
  }

  if (!isPlainObject(importedModule.default)) {
    throw new GlobalyzeError(
      `Config at ${resolvedConfigPath} must export a plain object.`
    );
  }

  const rawConfig = importedModule.default;
  const mergedConfig = { ...rawConfig, ...overrides };

  assertOptionalString("sourceDir", mergedConfig.sourceDir, resolvedConfigPath);
  assertOptionalString("localesDir", mergedConfig.localesDir, resolvedConfigPath);
  assertOptionalStringArray("languages", mergedConfig.languages, resolvedConfigPath);
  assertOptionalStringArray("ignore", mergedConfig.ignore, resolvedConfigPath);
  assertOptionalLocaleStructure(
    mergedConfig.localeStructure,
    resolvedConfigPath
  );
  assertOptionalBoolean(
    "cacheTranslations",
    mergedConfig.cacheTranslations,
    resolvedConfigPath
  );
  assertOptionalBoolean(
    "dynamicExtraction",
    mergedConfig.dynamicExtraction,
    resolvedConfigPath
  );
  assertOptionalAdapter(mergedConfig.i18nAdapter, resolvedConfigPath);
  assertOptionalStringArray(
    "translationInstructions",
    mergedConfig.translationInstructions,
    resolvedConfigPath
  );
  assertOptionalString(
    "sourceLocale",
    mergedConfig.sourceLocale,
    resolvedConfigPath
  );
  assertOptionalString(
    "openAiModel",
    mergedConfig.openAiModel,
    resolvedConfigPath
  );
  assertOptionalString(
    "geminiModel",
    mergedConfig.geminiModel,
    resolvedConfigPath
  );
  assertOptionalPositiveNumber(
    "aiBatchSize",
    mergedConfig.aiBatchSize,
    resolvedConfigPath
  );
  assertOptionalString(
    "translationImportPath",
    mergedConfig.translationImportPath,
    resolvedConfigPath
  );
  assertOptionalString(
    "translationFunctionName",
    mergedConfig.translationFunctionName,
    resolvedConfigPath
  );
  assertOptionalString(
    "translationHookName",
    mergedConfig.translationHookName,
    resolvedConfigPath
  );
  assertOptionalString(
    "providerImportPath",
    mergedConfig.providerImportPath,
    resolvedConfigPath
  );
  assertOptionalString(
    "providerComponentName",
    mergedConfig.providerComponentName,
    resolvedConfigPath
  );
  assertOptionalGovernance(mergedConfig.governance, resolvedConfigPath);
  assertOptionalString("lingoApiUrl", mergedConfig.lingoApiUrl, resolvedConfigPath);

  const sourceDirInput = resolveOptionalString(
    mergedConfig.sourceDir,
    "src"
  );
  const localesDirInput = resolveOptionalString(
    mergedConfig.localesDir,
    "locales"
  );

  const resolvedConfig: ResolvedGlobalyzeConfig = {
    rootDir,
    sourceDir: path.resolve(rootDir, sourceDirInput),
    localesDir: path.resolve(rootDir, localesDirInput),
    languages: normalizeLanguageList(
      mergedConfig.languages,
      DEFAULT_CONFIG.languages
    ),
    ignore: normalizeLanguageList(mergedConfig.ignore, DEFAULT_CONFIG.ignore),
    localeStructure: normalizeLocaleStructure(mergedConfig.localeStructure),
    cacheTranslations:
      typeof mergedConfig.cacheTranslations === "boolean"
        ? mergedConfig.cacheTranslations
        : DEFAULT_CONFIG.cacheTranslations,
    dynamicExtraction:
      typeof mergedConfig.dynamicExtraction === "boolean"
        ? mergedConfig.dynamicExtraction
        : DEFAULT_CONFIG.dynamicExtraction,
    i18nAdapter: normalizeI18nAdapter(mergedConfig.i18nAdapter),
    translationInstructions: normalizeStringList(
      mergedConfig.translationInstructions,
      DEFAULT_CONFIG.translationInstructions
    ),
    sourceLocale: resolveOptionalString(
      mergedConfig.sourceLocale,
      DEFAULT_CONFIG.sourceLocale
    ),
    openAiModel: resolveOptionalString(
      mergedConfig.openAiModel,
      DEFAULT_CONFIG.openAiModel
    ),
    geminiModel: resolveOptionalString(
      mergedConfig.geminiModel,
      DEFAULT_CONFIG.geminiModel
    ),
    aiBatchSize:
      typeof mergedConfig.aiBatchSize === "number" &&
      mergedConfig.aiBatchSize > 0
        ? mergedConfig.aiBatchSize
        : DEFAULT_CONFIG.aiBatchSize,
    translationImportPath: resolveOptionalString(
      mergedConfig.translationImportPath,
      DEFAULT_CONFIG.translationImportPath
    ),
    translationFunctionName: resolveOptionalString(
      mergedConfig.translationFunctionName,
      DEFAULT_CONFIG.translationFunctionName
    ),
    translationHookName:
      typeof mergedConfig.translationHookName === "string" &&
      mergedConfig.translationHookName.trim().length > 0
        ? mergedConfig.translationHookName.trim()
        : undefined,
    providerImportPath:
      typeof mergedConfig.providerImportPath === "string" &&
      mergedConfig.providerImportPath.trim().length > 0
        ? mergedConfig.providerImportPath.trim()
        : undefined,
    providerComponentName:
      typeof mergedConfig.providerComponentName === "string" &&
      mergedConfig.providerComponentName.trim().length > 0
        ? mergedConfig.providerComponentName.trim()
        : undefined,
    governance: normalizeGovernance(mergedConfig.governance),
    lingoApiUrl:
      typeof mergedConfig.lingoApiUrl === "string" &&
      mergedConfig.lingoApiUrl.trim().length > 0
        ? mergedConfig.lingoApiUrl.trim()
        : undefined
  };

  if (!resolvedConfig.languages.includes(resolvedConfig.sourceLocale)) {
    resolvedConfig.languages = [
      resolvedConfig.sourceLocale,
      ...resolvedConfig.languages
    ];
  }

  if (!(await fs.pathExists(resolvedConfig.sourceDir))) {
    throw new GlobalyzeError(
      `Source directory does not exist: ${resolvedConfig.sourceDir}`
    );
  }

  if (resolvedConfig.languages.length === 0) {
    throw new GlobalyzeError(
      `Config at ${resolvedConfigPath} must define at least one language.`
    );
  }

  return resolvedConfig;
}
