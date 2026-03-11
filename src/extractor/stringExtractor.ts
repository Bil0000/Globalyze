import path from "node:path";
import { stat } from "node:fs/promises";
import fs from "fs-extra";

import { parse } from "@babel/parser";
import traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { File } from "@babel/types";

import { extractDynamicStringsFromSource } from "./dynamicExtractor";
import type { DynamicExtractionCandidate } from "../types";
import { ensureGlobalyzeState } from "../state/globalyzeState";
import type { ExtractedString } from "../types";
import { GlobalyzeError } from "../utils/errors";
import { toPosixPath } from "../utils/fileUtils";
import {
  buildFileLocalizationMetadata,
  resolveComponentName,
  resolvePageName,
  type ResolvedFileLocalizationMetadata
} from "../utils/nameResolver";

const DATA_FILE_BASENAMES = new Set(["data.json"]);

const TRANSLATABLE_ATTRIBUTES = new Set([
  "title",
  "placeholder",
  "aria-label",
  "aria-placeholder",
  "alt",
  "label",
  "helperText",
  "caption",
  "description",
  "hint",
  "tooltip",
  "emptyMessage",
  "errorMessage"
]);

const TRANSLATABLE_OBJECT_PROPERTIES = new Set([
  "title",
  "label",
  "description",
  "helperText",
  "hint",
  "placeholder",
  "caption",
  "tooltip",
  "emptyMessage",
  "errorMessage",
  "ariaLabel",
  "ariaDescription",
  "tab",
  "heading",
  "subheading"
]);

const DATA_DRIVEN_PROPERTY_NAMES = new Set([
  "header",
  "type",
  "status",
  "reviewer",
  "source",
  "account",
  "stage",
  "blocker",
  "owner",
  "nextAction",
  "priority",
  "month",
  "name",
  "company"
]);

interface CachedExtractedStringEntry {
  text: string;
  line: number;
  column: number;
  kind: ExtractedString["kind"];
  attributeName?: string;
  propertyName?: string;
  elementType?: string;
}

interface CachedDynamicStringEntry {
  text: string;
  template: string;
  line: number;
  column: number;
  variables: Record<string, string>;
  elementType?: string;
}

interface ExtractionCacheEntry {
  signature: string;
  strings: CachedExtractedStringEntry[];
  dynamicStrings: CachedDynamicStringEntry[];
}

interface ExtractionCacheFile {
  version: 1;
  files: Record<string, ExtractionCacheEntry>;
}

export interface FileExtractionAnalysis {
  strings: ExtractedString[];
  dynamicStrings: DynamicExtractionCandidate[];
}

function isLikelyUiDataFile(filePath: string): boolean {
  const normalizedFilePath = toPosixPath(filePath).toLowerCase();
  const baseName = path.posix.basename(normalizedFilePath);

  return (
    DATA_FILE_BASENAMES.has(baseName) ||
    normalizedFilePath.includes("/_components/") ||
    normalizedFilePath.includes("/components/")
  );
}

function isEntityLabelProperty(propertyName: string): boolean {
  return propertyName === "name" || propertyName === "company";
}

function isLikelyDataDrivenProperty(
  propertyName: string,
  filePath: string
): boolean {
  if (isEntityLabelProperty(propertyName)) {
    return filePath.endsWith(".json") || toPosixPath(filePath).includes("/data-table/");
  }

  return (
    DATA_DRIVEN_PROPERTY_NAMES.has(propertyName) &&
    isLikelyUiDataFile(filePath)
  );
}

function buildFileSignature(size: number, mtimeMs: number): string {
  return `${String(size)}:${String(Math.trunc(mtimeMs))}`;
}

async function readExtractionCache(
  projectRoot?: string
): Promise<ExtractionCacheFile> {
  if (!projectRoot) {
    return {
      version: 1,
      files: {}
    };
  }

  const statePaths = await ensureGlobalyzeState(projectRoot);
  const parsed = (await fs.readJson(statePaths.extractionCachePath)) as unknown;

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    (parsed as { version?: unknown }).version !== 1
  ) {
    return {
      version: 1,
      files: {}
    };
  }

  const files = (parsed as { files?: unknown }).files;

  return {
    version: 1,
    files:
      typeof files === "object" && files !== null && !Array.isArray(files)
        ? (files as Record<string, ExtractionCacheEntry>)
        : {}
  };
}

async function writeExtractionCache(
  cache: ExtractionCacheFile,
  projectRoot?: string
): Promise<void> {
  if (!projectRoot) {
    return;
  }

  const statePaths = await ensureGlobalyzeState(projectRoot);
  await fs.writeJson(statePaths.extractionCachePath, cache, { spaces: 2 });
}

async function hasGeneratedJsonSidecar(filePath: string): Promise<boolean> {
  const basePath = filePath.replace(/\.json$/i, ".globalyze");

  return (
    (await fs.pathExists(`${basePath}.ts`)) ||
    (await fs.pathExists(`${basePath}.js`))
  );
}

function mayContainExtractableStrings(
  source: string,
  filePath: string,
  includeDynamic: boolean
): boolean {
  if (filePath.endsWith(".json")) {
    return true;
  }

  if (
    /<[\w.-]+/.test(source) ||
    /<\/[\w.-]+>/.test(source) ||
    /\b(title|label|description|helperText|hint|placeholder|caption|tooltip|header|status|source|reviewer|owner|account|stage|blocker|nextAction|priority|month|type)\b\s*[:=]/.test(
      source
    ) ||
    /\b(aria-label|aria-placeholder|alt|emptyMessage|errorMessage)\b\s*=/.test(
      source
    )
  ) {
    return true;
  }

  if (includeDynamic && source.includes("${") && source.includes("`")) {
    return true;
  }

  return false;
}

function toCachedStringEntries(
  items: readonly ExtractedString[]
): CachedExtractedStringEntry[] {
  return items.map((item) => ({
    text: item.text,
    line: item.line,
    column: item.column,
    kind: item.kind,
    ...(item.attributeName ? { attributeName: item.attributeName } : {}),
    ...(item.propertyName ? { propertyName: item.propertyName } : {}),
    ...(item.elementType ? { elementType: item.elementType } : {})
  }));
}

function toCachedDynamicEntries(
  items: readonly DynamicExtractionCandidate[]
): CachedDynamicStringEntry[] {
  return items.map((item) => ({
    text: item.text,
    template: item.template,
    line: item.line,
    column: item.column,
    variables: item.variables,
    ...(item.elementType ? { elementType: item.elementType } : {})
  }));
}

function applyMetadataToExtractedString(
  item: CachedExtractedStringEntry,
  filePath: string,
  metadata?: ResolvedFileLocalizationMetadata
): ExtractedString {
  return {
    text: item.text,
    file: toPosixPath(filePath),
    line: item.line,
    column: item.column,
    kind: item.kind,
    ...(item.attributeName ? { attributeName: item.attributeName } : {}),
    ...(item.propertyName ? { propertyName: item.propertyName } : {}),
    componentName: metadata?.componentName,
    pageName: metadata?.pageName,
    pageNames: metadata?.pageNames,
    ownershipConfidence: metadata?.ownershipConfidence,
    unresolvedOwnership: metadata?.unresolvedOwnership,
    elementType: item.elementType
  };
}

function applyMetadataToDynamicString(
  item: CachedDynamicStringEntry,
  filePath: string,
  metadata?: ResolvedFileLocalizationMetadata
): DynamicExtractionCandidate {
  return {
    text: item.text,
    template: item.template,
    file: toPosixPath(filePath),
    line: item.line,
    column: item.column,
    variables: item.variables,
    componentName: metadata?.componentName,
    pageName: metadata?.pageName,
    pageNames: metadata?.pageNames,
    ownershipConfidence: metadata?.ownershipConfidence,
    unresolvedOwnership: metadata?.unresolvedOwnership,
    elementType: item.elementType
  };
}

function parseSource(source: string, filePath: string): File {
  try {
    if (filePath.endsWith(".json")) {
      return parse(`export default ${source}`, {
        sourceType: "module",
        plugins: [
          "jsx",
          "typescript",
          "classProperties",
          "classPrivateProperties",
          "topLevelAwait",
          "importAttributes"
        ]
      });
    }

    return parse(source, {
      sourceType: "module",
      plugins: [
        "jsx",
        "typescript",
        "classProperties",
        "classPrivateProperties",
        "topLevelAwait",
        "importAttributes"
      ]
    });
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unknown parser failure";

    throw new GlobalyzeError(`Failed to parse ${filePath}: ${reason}`);
  }
}

export function normalizeUiText(value: string): string | null {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  if (!/[\p{L}\p{N}]/u.test(normalized)) {
    return null;
  }

  return normalized;
}

export function isTranslatableAttributeName(attributeName: string): boolean {
  return TRANSLATABLE_ATTRIBUTES.has(attributeName);
}

export function isTranslatableObjectPropertyName(propertyName: string): boolean {
  return TRANSLATABLE_OBJECT_PROPERTIES.has(propertyName);
}

export function isDataDrivenTranslatablePropertyName(
  propertyName: string,
  filePath: string
): boolean {
  return isLikelyDataDrivenProperty(propertyName, filePath);
}

function hasArrayExpressionAncestor(path: NodePath<t.ObjectProperty>): boolean {
  let current: NodePath | null = path.parentPath;

  while (current) {
    if (current.isArrayExpression()) {
      return true;
    }

    if (
      current.isCallExpression() ||
      current.isNewExpression() ||
      current.isJSXExpressionContainer()
    ) {
      return false;
    }

    current = current.parentPath;
  }

  return false;
}

export function shouldExtractObjectProperty(
  path: NodePath<t.ObjectProperty>,
  filePath: string,
  propertyName: string
): boolean {
  if (isTranslatableObjectPropertyName(propertyName)) {
    return true;
  }

  if (!isLikelyDataDrivenProperty(propertyName, filePath)) {
    return false;
  }

  if (filePath.endsWith(".json")) {
    return true;
  }

  return hasArrayExpressionAncestor(path);
}

function resolvePropertyName(
  node: t.Identifier | t.StringLiteral | t.NumericLiteral | t.BigIntLiteral | t.Expression | t.PrivateName
): string | null {
  if (t.isIdentifier(node)) {
    return node.name;
  }

  if (t.isStringLiteral(node)) {
    return node.value;
  }

  return null;
}

function extractStaticTextLiteral(
  value: t.Expression | t.PatternLike | t.SpreadElement | t.ArgumentPlaceholder
): string | null {
  if (t.isStringLiteral(value)) {
    return normalizeUiText(value.value);
  }

  if (t.isTemplateLiteral(value) && value.expressions.length === 0) {
    return normalizeUiText(value.quasis.map((quasi) => quasi.value.cooked ?? "").join(""));
  }

  return null;
}

function getLocation(
  line: number | undefined,
  column: number | undefined
): { line: number; column: number } {
  return {
    line: line ?? 1,
    column: (column ?? 0) + 1
  };
}

export function extractStringsFromSource(
  source: string,
  filePath: string,
  metadata?: ResolvedFileLocalizationMetadata
): ExtractedString[] {
  const ast = parseSource(source, filePath);
  const extracted: ExtractedString[] = [];
  const normalizedFilePath = toPosixPath(filePath);
  const componentName =
    metadata?.componentName ?? resolveComponentName(filePath, source);
  const pageName = metadata?.pageName ?? resolvePageName(filePath) ?? undefined;
  const pageNames = metadata?.pageNames;
  const ownershipConfidence = metadata?.ownershipConfidence;
  const unresolvedOwnership = metadata?.unresolvedOwnership;

  function resolveElementType(path: {
    parentPath: {
      isJSXElement: () => boolean;
      node?: unknown;
    };
  }): string | undefined {
    if (!path.parentPath.isJSXElement()) {
      return undefined;
    }

    const parentNode = path.parentPath.node as t.Node | null | undefined;

    if (!parentNode || !t.isJSXElement(parentNode)) {
      return undefined;
    }

    return t.isJSXIdentifier(parentNode.openingElement.name)
      ? parentNode.openingElement.name.name
      : undefined;
  }

  traverse(ast, {
    JSXText(path) {
      const text = normalizeUiText(path.node.value);

      if (!text) {
        return;
      }

      const location = getLocation(
        path.node.loc?.start.line,
        path.node.loc?.start.column
      );

      extracted.push({
        text,
        file: normalizedFilePath,
        line: location.line,
        column: location.column,
        kind: "jsx-text",
        componentName,
        pageName,
        pageNames,
        ownershipConfidence,
        unresolvedOwnership,
        elementType: resolveElementType(path)
      });
    },
    JSXExpressionContainer(path) {
      if (path.parentPath.isJSXAttribute()) {
        return;
      }

      if (path.node.expression.type !== "StringLiteral") {
        return;
      }

      const text = normalizeUiText(path.node.expression.value);

      if (!text) {
        return;
      }

      const location = getLocation(
        path.node.loc?.start.line,
        path.node.loc?.start.column
      );

      extracted.push({
        text,
        file: normalizedFilePath,
        line: location.line,
        column: location.column,
        kind: "jsx-expression-string",
        componentName,
        pageName,
        pageNames,
        ownershipConfidence,
        unresolvedOwnership,
        elementType: resolveElementType(path)
      });
    },
    JSXAttribute(path) {
      if (path.node.name.type !== "JSXIdentifier") {
        return;
      }

      if (!isTranslatableAttributeName(path.node.name.name)) {
        return;
      }

      if (path.node.value?.type !== "StringLiteral") {
        return;
      }

      const text = normalizeUiText(path.node.value.value);

      if (!text) {
        return;
      }

      const location = getLocation(
        path.node.loc?.start.line,
        path.node.loc?.start.column
      );

      extracted.push({
        text,
        file: normalizedFilePath,
        line: location.line,
        column: location.column,
        kind: "jsx-attribute",
        attributeName: path.node.name.name,
        componentName,
        pageName,
        pageNames,
        ownershipConfidence,
        unresolvedOwnership,
        elementType:
          t.isJSXOpeningElement(path.parentPath.node) &&
          t.isJSXIdentifier(path.parentPath.node.name)
            ? path.parentPath.node.name.name
            : undefined
      });
    },
    ObjectProperty(path) {
      if (path.node.computed) {
        return;
      }

      const propertyName = resolvePropertyName(path.node.key);

      if (
        !propertyName ||
        !shouldExtractObjectProperty(path, filePath, propertyName)
      ) {
        return;
      }

      const text = extractStaticTextLiteral(path.node.value);

      if (!text) {
        return;
      }

      const location = getLocation(
        path.node.loc?.start.line,
        path.node.loc?.start.column
      );

      extracted.push({
        text,
        file: normalizedFilePath,
        line: location.line,
        column: location.column,
        kind: "object-property",
        propertyName,
        componentName,
        pageName,
        pageNames,
        ownershipConfidence,
        unresolvedOwnership,
        elementType: undefined
      });
    }
  });

  return extracted;
}

export async function extractStringsFromFiles(
  filePaths: readonly string[],
  projectRoot?: string
): Promise<ExtractedString[]> {
  const analysis = await analyzeExtractableStringsFromFiles(filePaths, {
    projectRoot,
    includeDynamic: false
  });

  return analysis.strings;
}

export async function analyzeExtractableStringsFromFiles(
  filePaths: readonly string[],
  options: {
    projectRoot?: string;
    includeDynamic?: boolean;
  } = {}
): Promise<FileExtractionAnalysis> {
  const metadataMap = await buildFileLocalizationMetadata(filePaths);
  const includeDynamic = options.includeDynamic ?? false;
  const cache = await readExtractionCache(options.projectRoot);
  let cacheDirty = false;
  const strings: ExtractedString[] = [];
  const dynamicStrings: DynamicExtractionCandidate[] = [];

  for (const filePath of filePaths) {
    const resolvedFilePath = path.resolve(filePath);

    if (
      resolvedFilePath.endsWith(".json") &&
      (await hasGeneratedJsonSidecar(resolvedFilePath))
    ) {
      continue;
    }

    const posixFilePath = toPosixPath(resolvedFilePath);
    const relativeFilePath = options.projectRoot
      ? toPosixPath(path.relative(options.projectRoot, resolvedFilePath))
      : posixFilePath;
    const metadata = metadataMap.get(posixFilePath);
    const fileStats = await stat(resolvedFilePath);
    const signature = buildFileSignature(fileStats.size, fileStats.mtimeMs);
    const cached = cache.files[relativeFilePath];

    if (cached?.signature === signature) {
      strings.push(
        ...cached.strings.map((item) =>
          applyMetadataToExtractedString(item, resolvedFilePath, metadata)
        )
      );
      if (includeDynamic) {
        dynamicStrings.push(
          ...cached.dynamicStrings.map((item) =>
            applyMetadataToDynamicString(item, resolvedFilePath, metadata)
          )
        );
      }
      continue;
    }

    const source = await Bun.file(resolvedFilePath).text();
    let extractedStrings: ExtractedString[] = [];
    let extractedDynamicStrings: DynamicExtractionCandidate[] = [];

    if (mayContainExtractableStrings(source, resolvedFilePath, includeDynamic)) {
      extractedStrings = extractStringsFromSource(source, resolvedFilePath, metadata);
      extractedDynamicStrings = includeDynamic
        ? extractDynamicStringsFromSource(source, resolvedFilePath, metadata)
        : [];
    }

    strings.push(...extractedStrings);
    dynamicStrings.push(...extractedDynamicStrings);
    cache.files[relativeFilePath] = {
      signature,
      strings: toCachedStringEntries(extractedStrings),
      dynamicStrings: toCachedDynamicEntries(extractedDynamicStrings)
    };
    cacheDirty = true;
  }

  if (cacheDirty) {
    await writeExtractionCache(cache, options.projectRoot);
  }

  return {
    strings,
    dynamicStrings
  };
}
