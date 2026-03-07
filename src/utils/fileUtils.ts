import path from "node:path";
import { pathToFileURL } from "node:url";

import fs from "fs-extra";

import type {
  GlobalyzeConfig,
  LocaleDictionary,
  ResolvedGlobalyzeConfig,
  SupportedFileExtension
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

const DEFAULT_CONFIG: Omit<ResolvedGlobalyzeConfig, "rootDir" | "sourceDir" | "localesDir"> =
  {
    languages: ["en", "ar", "fr", "de"],
    ignore: DEFAULT_IGNORE,
    sourceLocale: "en",
    aiModel: "gpt-4o-mini",
    aiBatchSize: 20,
    translationImportPath: "@/i18n",
    translationFunctionName: "t",
    lingoApiUrl: undefined
  };

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

export function createDefaultConfigContents(): string {
  return [
    "export default {",
    '  sourceDir: "src",',
    '  localesDir: "locales",',
    '  languages: ["en", "ar", "fr", "de"],',
    '  ignore: ["node_modules", "dist", "build", ".next", ".git"]',
    "};",
    ""
  ].join("\n");
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
  const rootDir = path.dirname(resolvedConfigPath);

  assertOptionalString("sourceDir", mergedConfig.sourceDir, resolvedConfigPath);
  assertOptionalString("localesDir", mergedConfig.localesDir, resolvedConfigPath);
  assertOptionalStringArray("languages", mergedConfig.languages, resolvedConfigPath);
  assertOptionalStringArray("ignore", mergedConfig.ignore, resolvedConfigPath);
  assertOptionalString(
    "sourceLocale",
    mergedConfig.sourceLocale,
    resolvedConfigPath
  );
  assertOptionalString("aiModel", mergedConfig.aiModel, resolvedConfigPath);
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
    sourceLocale: resolveOptionalString(
      mergedConfig.sourceLocale,
      DEFAULT_CONFIG.sourceLocale
    ),
    aiModel: resolveOptionalString(mergedConfig.aiModel, DEFAULT_CONFIG.aiModel),
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
