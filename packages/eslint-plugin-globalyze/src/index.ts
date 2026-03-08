import type { Rule } from "eslint";

const TRANSLATABLE_ATTRIBUTES = new Set([
  "title",
  "placeholder",
  "aria-label",
  "aria-placeholder",
  "alt"
]);

function normalizeUiText(value: string): string | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  return /[\p{L}\p{N}]/u.test(normalized) ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const noHardcodedUiStrings: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Detect hardcoded UI strings in JSX",
      recommended: false
    },
    fixable: "code",
    messages: {
      hardcoded: "Hardcoded UI string detected. Use a translation key instead."
    },
    schema: []
  },
  create(context) {
    return {
      JSXText(node: unknown) {
        if (!isRecord(node) || typeof node.value !== "string") {
          return;
        }

        if (!normalizeUiText(node.value)) {
          return;
        }

        context.report({
          node: node as unknown as Rule.Node,
          messageId: "hardcoded"
        });
      },
      Literal(node: unknown) {
        if (!isRecord(node) || typeof node.value !== "string") {
          return;
        }

        const parent = isRecord(node.parent) ? node.parent : null;

        if (
          !normalizeUiText(node.value) ||
          parent?.type !== "JSXExpressionContainer"
        ) {
          return;
        }

        context.report({
          node: node as unknown as Rule.Node,
          messageId: "hardcoded"
        });
      },
      JSXAttribute(node: unknown) {
        if (!isRecord(node) || !isRecord(node.name) || !isRecord(node.value)) {
          return;
        }

        if (
          node.name.type !== "JSXIdentifier" ||
          typeof node.name.name !== "string" ||
          !TRANSLATABLE_ATTRIBUTES.has(node.name.name) ||
          node.value.type !== "Literal" ||
          typeof node.value.value !== "string" ||
          !normalizeUiText(node.value.value)
        ) {
          return;
        }

        context.report({
          node: node as unknown as Rule.Node,
          messageId: "hardcoded"
        });
      }
    };
  }
};

const plugin = {
  rules: {
    "no-hardcoded-ui-strings": noHardcodedUiStrings
  }
};

export default plugin;
