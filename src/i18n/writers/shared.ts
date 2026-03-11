import path from "node:path";

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import fs from "fs-extra";

import type {
  LocaleDictionary,
  LocaleEntry,
  LocaleEntryDictionary,
  LocaleFileContent,
  LocaleKeyReference,
  LocaleStructureConfig,
  ResolvedGlobalyzeConfig,
  TranslationMetaEntry
} from "../../types";
import { GlobalyzeError } from "../../utils/errors";

const GENERIC_PATH_SEGMENTS = new Set(["src", "app", "pages", "components", "ui"]);

function slugifySegment(value: string): string {
  return value
    .replace(/\.[^.]+$/, "")
    .trim()
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function camelCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment, index) =>
      index === 0
        ? segment.toLowerCase()
        : `${segment.slice(0, 1).toUpperCase()}${segment.slice(1).toLowerCase()}`
    )
    .join("");
}

export function buildJsLocaleExportName(fileName: string): string {
  return camelCase(fileName.replace(/\.[^.]+$/, "")) || "locale";
}

function pascalCase(value: string): string {
  const output = camelCase(value);

  return output.length > 0
    ? `${output.slice(0, 1).toUpperCase()}${output.slice(1)}`
    : output;
}

export function normalizeLocaleEntry(value: LocaleEntry): TranslationMetaEntry {
  return typeof value === "string"
    ? { value }
    : {
        value: value.value,
        ...(value.owner ? { owner: value.owner } : {}),
        ...(typeof value.locked === "boolean" ? { locked: value.locked } : {}),
        ...(typeof value.approvalRequired === "boolean"
          ? { approvalRequired: value.approvalRequired }
          : {})
      };
}

export function buildPlainLocaleDictionary(
  entries: LocaleEntryDictionary
): LocaleDictionary {
  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [key, value.value])
  );
}

function buildLocalizedFileName(
  bucket: string,
  structure: LocaleStructureConfig
): string {
  const extension = structure.format;

  if (bucket === "common") {
    return `common.${extension}`;
  }

  if (structure.naming === "camel") {
    return `${camelCase(bucket)}${pascalCase(structure.splitStrategy)}.${extension}`;
  }

  if (structure.naming === "snake") {
    return `${bucket}_${structure.splitStrategy}.${extension}`;
  }

  if (structure.naming === "kebab") {
    return `${bucket.replace(/_/g, "-")}-${structure.splitStrategy}.${extension}`;
  }

  return `${bucket}.${structure.splitStrategy}.${extension}`;
}

function buildAssignmentMap(
  assignments?: readonly LocaleKeyReference[]
): Map<string, LocaleKeyReference[]> {
  const map = new Map<string, LocaleKeyReference[]>();

  for (const assignment of assignments ?? []) {
    const bucketAssignments = map.get(assignment.key) ?? [];
    bucketAssignments.push(assignment);
    map.set(assignment.key, bucketAssignments);
  }

  return map;
}

function resolveBucketFromFile(
  filePath: string,
  splitStrategy: LocaleStructureConfig["splitStrategy"]
): string {
  const normalized = filePath.split(path.sep).join(path.posix.sep);
  const segments = normalized.split("/").filter(Boolean);
  const fileName = segments.at(-1) ?? "common";
  const baseName = slugifySegment(fileName) || "common";

  if (splitStrategy === "component") {
    return baseName;
  }

  if (["page", "index", "layout"].includes(baseName)) {
    const parent = segments
      .slice(0, -1)
      .reverse()
      .find((segment) => !GENERIC_PATH_SEGMENTS.has(slugifySegment(segment)));

    return slugifySegment(parent ?? baseName) || "common";
  }

  return baseName;
}

function resolveBucketFromKey(key: string): string {
  const firstSegment = key.split(".")[0] ?? "common";
  return slugifySegment(firstSegment) || "common";
}

function buildInitialBuckets(
  sourceLocale: LocaleEntryDictionary,
  assignments: readonly LocaleKeyReference[] | undefined,
  structure: LocaleStructureConfig
): Map<string, string[]> {
  const assignmentMap = buildAssignmentMap(assignments);
  const buckets = new Map<string, string[]>();
  const splitStrategy = structure.splitStrategy;

  for (const key of Object.keys(sourceLocale).sort((left, right) =>
    left.localeCompare(right)
  )) {
    const keyAssignments = assignmentMap.get(key) ?? [];
    const hasPageReference = keyAssignments.some(
      (assignment) => assignment.sourceType === "page"
    );
    const hasComponentReference = keyAssignments.some(
      (assignment) =>
        assignment.sourceType === "component" ||
        (typeof assignment.componentName === "string" &&
          assignment.componentName.length > 0)
    );
    const pageNames = [...new Set(
      keyAssignments
        .flatMap((assignment) =>
          assignment.pageNames && assignment.pageNames.length > 0
            ? assignment.pageNames
            : assignment.pageName
              ? [assignment.pageName]
              : []
        )
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .map((value) => slugifySegment(value))
        .filter(Boolean)
    )];
    const componentNames = [...new Set(
      keyAssignments
        .map((assignment) => assignment.componentName)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .map((value) => slugifySegment(value))
        .filter(Boolean)
    )];
    const unresolvedStrategy =
      keyAssignments[0]?.unresolvedOwnership ?? structure.unresolvedOwnership;
    const bucket =
      splitStrategy === "page"
        ? pageNames.length === 1
          ? pageNames[0]
          : pageNames.length > 1
            ? "common"
            : hasComponentReference && !hasPageReference
              ? unresolvedStrategy === "file"
                ? "unresolved"
                : unresolvedStrategy === "page"
                  ? keyAssignments[0]
                    ? resolveBucketFromFile(keyAssignments[0].file, splitStrategy)
                    : resolveBucketFromKey(key)
                  : "common"
              : keyAssignments[0]
              ? resolveBucketFromFile(keyAssignments[0].file, splitStrategy)
              : resolveBucketFromKey(key)
        : componentNames.length === 1
          ? componentNames[0]
          : componentNames.length > 1
            ? "common"
            : keyAssignments[0]
              ? resolveBucketFromFile(keyAssignments[0].file, splitStrategy)
              : resolveBucketFromKey(key);
    const normalizedBucket = bucket ?? resolveBucketFromKey(key);
    const keys = buckets.get(normalizedBucket) ?? [];
    keys.push(key);
    buckets.set(normalizedBucket, keys);
  }

  return buckets;
}

function moveRepeatedValuesToCommon(
  buckets: Map<string, string[]>,
  sourceLocale: LocaleEntryDictionary
): Map<string, string[]> {
  const valueToBuckets = new Map<string, Set<string>>();

  for (const [bucket, keys] of buckets.entries()) {
    for (const key of keys) {
      const value = sourceLocale[key]?.value;

      if (!value) {
        continue;
      }

      const bucketSet = valueToBuckets.get(value) ?? new Set<string>();
      bucketSet.add(bucket);
      valueToBuckets.set(value, bucketSet);
    }
  }

  const commonKeys = new Set<string>();

  for (const [value, bucketSet] of valueToBuckets.entries()) {
    if (bucketSet.size < 2) {
      continue;
    }

    for (const [key, localeValue] of Object.entries(sourceLocale)) {
      if (localeValue.value === value) {
        commonKeys.add(key);
      }
    }
  }

  if (commonKeys.size === 0) {
    return buckets;
  }

  const nextBuckets = new Map<string, string[]>();

  for (const [bucket, keys] of buckets.entries()) {
    const filtered = keys.filter((key) => !commonKeys.has(key));

    if (filtered.length > 0) {
      nextBuckets.set(bucket, filtered);
    }
  }

  nextBuckets.set(
    "common",
    [...commonKeys].sort((left, right) => left.localeCompare(right))
  );

  return nextBuckets;
}

export function buildLocaleFileContents(
  language: string,
  locale: LocaleEntryDictionary,
  sourceLocale: LocaleEntryDictionary,
  structure: LocaleStructureConfig,
  assignments?: readonly LocaleKeyReference[],
  sourceLanguage = "en"
): LocaleFileContent[] {
  const buildFallbackEntry = (key: string): TranslationMetaEntry => ({
    ...(sourceLocale[key] ?? { value: "" }),
    value: language === sourceLanguage ? sourceLocale[key]?.value ?? "" : ""
  });

  if (structure.structure === "single") {
    return [
      {
        fileName: `${language}.${structure.format}`,
        entries: Object.fromEntries(
          Object.keys(sourceLocale)
            .sort((left, right) => left.localeCompare(right))
            .map((key) => [
              key,
              locale[key] ?? buildFallbackEntry(key)
            ])
        )
      }
    ];
  }

  const initialBuckets = buildInitialBuckets(
    sourceLocale,
    assignments,
    structure
  );
  const buckets = structure.commonFile
    ? moveRepeatedValuesToCommon(initialBuckets, sourceLocale)
    : initialBuckets;

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucket, keys]) => ({
      fileName: buildLocalizedFileName(bucket, structure),
      entries: Object.fromEntries(
        keys.map((key) => [
          key,
          locale[key] ?? buildFallbackEntry(key)
        ])
      )
    }));
}

function serializeLocaleEntry(
  rawValue: LocaleEntry
): string | Record<string, unknown> {
  const value = normalizeLocaleEntry(rawValue);

  if (!value.owner && value.locked !== true && value.approvalRequired !== true) {
    return value.value;
  }

  const serialized: Record<string, unknown> = {
    value: value.value
  };

  if (value.owner) {
    serialized.owner = value.owner;
  }
  if (typeof value.locked === "boolean") {
    serialized.locked = value.locked;
  }
  if (typeof value.approvalRequired === "boolean") {
    serialized.approvalRequired = value.approvalRequired;
  }

  return serialized;
}

function formatJson(entries: LocaleEntryDictionary): string {
  const sorted = Object.fromEntries(
    Object.entries(entries)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, serializeLocaleEntry(value)])
  );

  return `${JSON.stringify(sorted, null, 2)}\n`;
}

function formatJs(entries: LocaleEntryDictionary, fileName: string): string {
  const exportName = buildJsLocaleExportName(fileName);
  const sorted = Object.fromEntries(
    Object.entries(entries)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, serializeLocaleEntry(value)])
  );

  return [
    `export const ${exportName} = ${JSON.stringify(sorted, null, 2)};`,
    ""
  ].join("\n");
}

function formatTs(entries: LocaleEntryDictionary, fileName: string): string {
  const exportName = buildJsLocaleExportName(fileName);
  const sorted = Object.fromEntries(
    Object.entries(entries)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, serializeLocaleEntry(value)])
  );

  return [
    `export const ${exportName} = ${JSON.stringify(sorted, null, 2)} as const;`,
    ""
  ].join("\n");
}

export async function writeLocaleFiles(
  directoryPath: string,
  files: readonly LocaleFileContent[],
  format: LocaleStructureConfig["format"]
): Promise<void> {
  await fs.ensureDir(directoryPath);
  const desiredFileNames = new Set(files.map((file) => file.fileName));

  for (const file of files) {
    const filePath = path.join(directoryPath, file.fileName);
    const tempFilePath = `${filePath}.globalyze-tmp`;
    const contents =
      format === "json"
        ? formatJson(file.entries)
        : format === "ts"
          ? formatTs(file.entries, file.fileName)
          : formatJs(file.entries, file.fileName);
    await fs.writeFile(tempFilePath, contents, "utf8");
    await fs.move(tempFilePath, filePath, { overwrite: true });
  }

  const existingFiles = await fs.readdir(directoryPath);

  for (const fileName of existingFiles) {
    if (desiredFileNames.has(fileName) || fileName.endsWith(".globalyze-tmp")) {
      continue;
    }

    if (!/\.(json|js|ts)$/.test(fileName)) {
      continue;
    }

    await fs.remove(path.join(directoryPath, fileName));
  }
}

function readObjectPropertyKey(property: t.ObjectProperty): string | null {
  return t.isIdentifier(property.key)
    ? property.key.name
    : t.isStringLiteral(property.key)
      ? property.key.value
      : null;
}

function parseObjectExpression(node: t.ObjectExpression): LocaleEntryDictionary {
  const entries: LocaleEntryDictionary = {};

  for (const property of node.properties) {
    if (!t.isObjectProperty(property)) {
      continue;
    }

    const key = readObjectPropertyKey(property);

    if (!key) {
      continue;
    }

    if (t.isStringLiteral(property.value)) {
      entries[key] = { value: property.value.value };
      continue;
    }

    if (!t.isObjectExpression(property.value)) {
      continue;
    }

    const nextEntry: Partial<TranslationMetaEntry> = {};

    for (const nestedProperty of property.value.properties) {
      if (!t.isObjectProperty(nestedProperty)) {
        continue;
      }

      const nestedKey = readObjectPropertyKey(nestedProperty);

      if (!nestedKey) {
        continue;
      }

      if (nestedKey === "value" && t.isStringLiteral(nestedProperty.value)) {
        nextEntry.value = nestedProperty.value.value;
      }
      if (nestedKey === "owner" && t.isStringLiteral(nestedProperty.value)) {
        nextEntry.owner = nestedProperty.value.value;
      }
      if (nestedKey === "locked" && t.isBooleanLiteral(nestedProperty.value)) {
        nextEntry.locked = nestedProperty.value.value;
      }
      if (
        nestedKey === "approvalRequired" &&
        t.isBooleanLiteral(nestedProperty.value)
      ) {
        nextEntry.approvalRequired = nestedProperty.value.value;
      }
    }

    if (typeof nextEntry.value === "string") {
      entries[key] = normalizeLocaleEntry(nextEntry as TranslationMetaEntry);
    }
  }

  return entries;
}

export function parseJsLocaleModule(
  source: string,
  filePath: string
): LocaleEntryDictionary {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript"]
  });
  let extracted: LocaleEntryDictionary = {};
  let exportCount = 0;

  traverse(ast, {
    ExportNamedDeclaration(path) {
      const declaration = path.node.declaration;

      if (!t.isVariableDeclaration(declaration)) {
        return;
      }

      for (const declarator of declaration.declarations) {
        if (
          t.isIdentifier(declarator.id) &&
          declarator.init &&
          (t.isObjectExpression(declarator.init) ||
            (t.isTSAsExpression(declarator.init) &&
              t.isObjectExpression(declarator.init.expression)))
        ) {
          const objectNode = t.isObjectExpression(declarator.init)
            ? declarator.init
            : t.isObjectExpression(declarator.init.expression)
              ? declarator.init.expression
              : null;

          if (!objectNode) {
            continue;
          }
          exportCount += 1;
          extracted = {
            ...extracted,
            ...parseObjectExpression(objectNode)
          };
        }
      }
    }
  });

  if (exportCount === 0) {
    throw new GlobalyzeError(`Failed to parse locale JS module at ${filePath}.`);
  }

  return extracted;
}

function isTranslationMetaShape(value: unknown): value is TranslationMetaEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "value" in value &&
    typeof value.value === "string"
  );
}

export async function readLocaleFileEntries(
  filePath: string
): Promise<LocaleEntryDictionary> {
  const source = await fs.readFile(filePath, "utf8");

  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(source) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new GlobalyzeError(`Expected ${filePath} to contain a JSON object.`);
    }

    const entries: LocaleEntryDictionary = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        entries[key] = { value };
        continue;
      }

      if (isTranslationMetaShape(value)) {
        entries[key] = normalizeLocaleEntry(value);
      }
    }

    return entries;
  }

  return parseJsLocaleModule(source, filePath);
}

export async function readLocaleFile(filePath: string): Promise<LocaleDictionary> {
  return buildPlainLocaleDictionary(await readLocaleFileEntries(filePath));
}

export async function readLanguageDirectoryEntries(
  config: ResolvedGlobalyzeConfig,
  language: string
): Promise<LocaleEntryDictionary> {
  const languageDir = path.join(config.localesDir, language);
  const legacyFilePath = path.join(
    config.localesDir,
    `${language}.${config.localeStructure.format}`
  );
  const dictionaries: LocaleEntryDictionary[] = [];

  if (await fs.pathExists(languageDir)) {
    const files = (await fs.readdir(languageDir))
      .filter((fileName) =>
        fileName.endsWith(`.${config.localeStructure.format}`)
      )
      .sort((left, right) => left.localeCompare(right));

    for (const fileName of files) {
      dictionaries.push(
        await readLocaleFileEntries(path.join(languageDir, fileName))
      );
    }
  } else if (await fs.pathExists(legacyFilePath)) {
    dictionaries.push(await readLocaleFileEntries(legacyFilePath));
  }

  return dictionaries.reduce<LocaleEntryDictionary>(
    (accumulator, current) => ({ ...accumulator, ...current }),
    {}
  );
}

export async function readLanguageDirectory(
  config: ResolvedGlobalyzeConfig,
  language: string
): Promise<LocaleDictionary> {
  return buildPlainLocaleDictionary(
    await readLanguageDirectoryEntries(config, language)
  );
}

export async function removeStaleLanguageOutputs(
  config: ResolvedGlobalyzeConfig,
  activeLanguages: readonly string[]
): Promise<string[]> {
  if (!(await fs.pathExists(config.localesDir))) {
    return [];
  }

  const removed: string[] = [];
  const entries = await fs.readdir(config.localesDir);

  for (const entry of entries) {
    const fullPath = path.join(config.localesDir, entry);
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      if (!activeLanguages.includes(entry)) {
        await fs.remove(fullPath);
        removed.push(entry);
      }

      continue;
    }

    const match = /^([a-z0-9_-]+)\.(json|js)$/i.exec(entry);

    if (match?.[1]) {
      await fs.remove(fullPath);
      removed.push(match[1]);
    }
  }

  return [...new Set(removed)].sort((left, right) => left.localeCompare(right));
}
