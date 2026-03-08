import path from "node:path";

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import fs from "fs-extra";

import type {
  LocaleDictionary,
  LocaleFileContent,
  LocaleKeyReference,
  LocaleStructureConfig,
  ResolvedGlobalyzeConfig
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

function pascalCase(value: string): string {
  const output = camelCase(value);

  return output.length > 0
    ? `${output.slice(0, 1).toUpperCase()}${output.slice(1)}`
    : output;
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
): Map<string, LocaleKeyReference> {
  return new Map((assignments ?? []).map((assignment) => [assignment.key, assignment]));
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
  sourceLocale: LocaleDictionary,
  assignments: readonly LocaleKeyReference[] | undefined,
  splitStrategy: LocaleStructureConfig["splitStrategy"]
): Map<string, string[]> {
  const assignmentMap = buildAssignmentMap(assignments);
  const buckets = new Map<string, string[]>();

  for (const key of Object.keys(sourceLocale).sort((left, right) =>
    left.localeCompare(right)
  )) {
    const assignment = assignmentMap.get(key);
    const bucket = assignment
      ? resolveBucketFromFile(assignment.file, splitStrategy)
      : resolveBucketFromKey(key);
    const keys = buckets.get(bucket) ?? [];
    keys.push(key);
    buckets.set(bucket, keys);
  }

  return buckets;
}

function moveRepeatedValuesToCommon(
  buckets: Map<string, string[]>,
  sourceLocale: LocaleDictionary
): Map<string, string[]> {
  const valueToBuckets = new Map<string, Set<string>>();

  for (const [bucket, keys] of buckets.entries()) {
    for (const key of keys) {
      const value = sourceLocale[key];

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
      if (localeValue === value) {
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
  locale: LocaleDictionary,
  sourceLocale: LocaleDictionary,
  structure: LocaleStructureConfig,
  assignments?: readonly LocaleKeyReference[]
): LocaleFileContent[] {
  if (structure.structure === "single") {
    return [
      {
        fileName: `${language}.${structure.format}`,
        entries: Object.fromEntries(
          Object.keys(sourceLocale)
            .sort((left, right) => left.localeCompare(right))
            .map((key) => [key, locale[key] ?? ""])
        )
      }
    ];
  }

  const initialBuckets = buildInitialBuckets(
    sourceLocale,
    assignments,
    structure.splitStrategy
  );
  const buckets = structure.commonFile
    ? moveRepeatedValuesToCommon(initialBuckets, sourceLocale)
    : initialBuckets;

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucket, keys]) => ({
      fileName: buildLocalizedFileName(bucket, structure),
      entries: Object.fromEntries(
        keys.map((key) => [key, locale[key] ?? ""])
      )
    }));
}

function formatJson(entries: LocaleDictionary): string {
  const sorted = Object.fromEntries(
    Object.entries(entries).sort(([left], [right]) => left.localeCompare(right))
  );

  return `${JSON.stringify(sorted, null, 2)}\n`;
}

function formatJs(entries: LocaleDictionary, fileName: string): string {
  const exportName = camelCase(fileName.replace(/\.[^.]+$/, "")) || "locale";
  const sorted = Object.fromEntries(
    Object.entries(entries).sort(([left], [right]) => left.localeCompare(right))
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
  await fs.remove(directoryPath);
  await fs.ensureDir(directoryPath);

  for (const file of files) {
    const filePath = path.join(directoryPath, file.fileName);
    const contents =
      format === "json"
        ? formatJson(file.entries)
        : formatJs(file.entries, file.fileName);
    await fs.writeFile(filePath, contents, "utf8");
  }
}

function parseObjectExpression(node: t.ObjectExpression): LocaleDictionary {
  const entries: LocaleDictionary = {};

  for (const property of node.properties) {
    if (!t.isObjectProperty(property)) {
      continue;
    }

    const key = t.isIdentifier(property.key)
      ? property.key.name
      : t.isStringLiteral(property.key)
        ? property.key.value
        : null;
    const valueNode =
      t.isStringLiteral(property.value) ? property.value.value : null;

    if (key && valueNode !== null) {
      entries[key] = valueNode;
    }
  }

  return entries;
}

export function parseJsLocaleModule(source: string, filePath: string): LocaleDictionary {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript"]
  });
  let extracted: LocaleDictionary = {};

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
          extracted = {
            ...extracted,
            ...parseObjectExpression(objectNode)
          };
        }
      }
    }
  });

  if (Object.keys(extracted).length === 0) {
    throw new GlobalyzeError(`Failed to parse locale JS module at ${filePath}.`);
  }

  return extracted;
}

export async function readLocaleFile(filePath: string): Promise<LocaleDictionary> {
  const source = await fs.readFile(filePath, "utf8");

  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(source) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new GlobalyzeError(`Expected ${filePath} to contain a JSON object.`);
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === "string")
    ) as LocaleDictionary;
  }

  return parseJsLocaleModule(source, filePath);
}

export async function readLanguageDirectory(
  config: ResolvedGlobalyzeConfig,
  language: string
): Promise<LocaleDictionary> {
  const languageDir = path.join(config.localesDir, language);
  const legacyFilePath = path.join(config.localesDir, `${language}.${config.localeStructure.format}`);
  const dictionaries: LocaleDictionary[] = [];

  if (await fs.pathExists(languageDir)) {
    const files = (await fs.readdir(languageDir))
      .filter((fileName) =>
        fileName.endsWith(`.${config.localeStructure.format}`)
      )
      .sort((left, right) => left.localeCompare(right));

    for (const fileName of files) {
      dictionaries.push(await readLocaleFile(path.join(languageDir, fileName)));
    }
  } else if (await fs.pathExists(legacyFilePath)) {
    dictionaries.push(await readLocaleFile(legacyFilePath));
  }

  return dictionaries.reduce<LocaleDictionary>(
    (accumulator, current) => ({ ...accumulator, ...current }),
    {}
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
