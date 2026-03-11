import path from "node:path";

import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import { toPosixPath } from "../utils/fileUtils";

const DATA_FILE_BASENAMES = new Set(["data.json"]);

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

const UI_CONTAINER_PROPERTY_NAMES = new Set([
  "actions",
  "cards",
  "chart",
  "chartConfig",
  "chartData",
  "columns",
  "columnDefs",
  "data",
  "datasets",
  "emptyState",
  "fields",
  "filters",
  "footerActions",
  "groups",
  "items",
  "legend",
  "links",
  "menu",
  "menuItems",
  "metrics",
  "navigation",
  "options",
  "recentLeadsData",
  "rows",
  "sections",
  "series",
  "sidebarItems",
  "stats",
  "tabs",
  "toolbar",
  "tooltip"
]);

const COLLECTION_CONTEXT_PATTERNS = [
  /rows$/i,
  /data$/i,
  /items$/i,
  /columns$/i,
  /cards$/i,
  /tabs$/i,
  /sections$/i,
  /series$/i,
  /datasets$/i,
  /metrics$/i,
  /filters$/i,
  /legend$/i,
  /links$/i,
  /statuses$/i,
  /sources$/i,
  /owners$/i,
  /reviewers$/i,
  /_rows$/i,
  /_data$/i,
  /_items$/i,
  /_columns$/i
];

const TOAST_CALL_IDENTIFIERS = new Set(["toast", "sonnerToast"]);
const TOAST_METHOD_NAMES = new Set([
  "toast",
  "success",
  "error",
  "warning",
  "info",
  "message",
  "promise"
]);
const TOAST_PROPERTY_NAMES = new Set([
  "loading",
  "success",
  "error",
  "title",
  "description",
  "message"
]);

function normalizePropertyContextName(propertyName: string): string {
  return propertyName.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}

function matchesCollectionContextName(name: string): boolean {
  const normalized = normalizePropertyContextName(name);

  if (UI_CONTAINER_PROPERTY_NAMES.has(name)) {
    return true;
  }

  for (const candidate of UI_CONTAINER_PROPERTY_NAMES) {
    if (normalizePropertyContextName(candidate) === normalized) {
      return true;
    }
  }

  return COLLECTION_CONTEXT_PATTERNS.some((pattern) => pattern.test(name));
}

function isEntityLabelProperty(propertyName: string): boolean {
  return propertyName === "name" || propertyName === "company";
}

export function resolvePropertyName(
  node:
    | t.Identifier
    | t.StringLiteral
    | t.NumericLiteral
    | t.BigIntLiteral
    | t.Expression
    | t.PrivateName
): string | null {
  if (t.isIdentifier(node)) {
    return node.name;
  }

  if (t.isStringLiteral(node)) {
    return node.value;
  }

  return null;
}

export function isLikelyUiDataFile(filePath: string): boolean {
  const normalizedFilePath = toPosixPath(filePath).toLowerCase();
  const baseName = path.posix.basename(normalizedFilePath);

  return (
    DATA_FILE_BASENAMES.has(baseName) ||
    normalizedFilePath.includes("/_components/") ||
    normalizedFilePath.includes("/components/") ||
    normalizedFilePath.includes("/navigation/") ||
    normalizedFilePath.includes("/data-table/") ||
    normalizedFilePath.includes("/tables/") ||
    /\.config\.[jt]sx?$/.test(normalizedFilePath)
  );
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

export function isLikelyDataDrivenPropertyName(
  propertyName: string,
  filePath: string
): boolean {
  return isLikelyDataDrivenProperty(propertyName, filePath);
}

export function isUiContainerPropertyName(propertyName: string): boolean {
  return matchesCollectionContextName(propertyName);
}

export function hasArrayExpressionAncestor(
  path: NodePath<t.ObjectProperty>
): boolean {
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

export function hasSupportedUiCollectionContext(
  path: NodePath<t.ObjectProperty>
): boolean {
  let current: NodePath | null = path.parentPath;

  while (current) {
    if (current.isObjectProperty()) {
      const propertyName = resolvePropertyName(current.node.key);

      if (propertyName && matchesCollectionContextName(propertyName)) {
        return true;
      }
    }

    if (current.isVariableDeclarator()) {
      const identifier = current.node.id;

      if (t.isIdentifier(identifier) && matchesCollectionContextName(identifier.name)) {
        return true;
      }
    }

    current = current.parentPath;
  }

  return false;
}

function isSupportedToastCallee(
  callee: t.Expression | t.Super | t.V8IntrinsicIdentifier
): boolean {
  if (t.isIdentifier(callee)) {
    return TOAST_CALL_IDENTIFIERS.has(callee.name);
  }

  if (
    t.isMemberExpression(callee) &&
    !callee.computed &&
    t.isIdentifier(callee.object) &&
    t.isIdentifier(callee.property)
  ) {
    return (
      TOAST_CALL_IDENTIFIERS.has(callee.object.name) &&
      TOAST_METHOD_NAMES.has(callee.property.name)
    );
  }

  return false;
}

export function isSupportedToastCallExpressionPath(
  path: NodePath<t.CallExpression>
): boolean {
  return isSupportedToastCallee(path.node.callee);
}

function hasToastCallAncestor(path: NodePath): boolean {
  let current: NodePath | null = path.parentPath;

  while (current) {
    if (current.isCallExpression() && isSupportedToastCallExpressionPath(current)) {
      return true;
    }

    current = current.parentPath;
  }

  return false;
}

export function shouldExtractToastProperty(
  path: NodePath<t.ObjectProperty>,
  propertyName: string
): boolean {
  return TOAST_PROPERTY_NAMES.has(propertyName) && hasToastCallAncestor(path);
}

export function shouldExtractDataDrivenProperty(
  path: NodePath<t.ObjectProperty>,
  filePath: string,
  propertyName: string
): boolean {
  if (!isLikelyDataDrivenProperty(propertyName, filePath)) {
    return false;
  }

  if (filePath.endsWith(".json")) {
    return true;
  }

  return (
    hasArrayExpressionAncestor(path) &&
    (isLikelyUiDataFile(filePath) || hasSupportedUiCollectionContext(path))
  );
}
