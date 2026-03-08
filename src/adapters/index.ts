import * as t from "@babel/types";

import type { ResolvedGlobalyzeConfig } from "../types";

export interface ResolvedAdapter {
  name: string;
  importPath?: string;
  translationFunctionName: string;
  hookName?: string;
  hookBindingName?: string;
  providerImportPath?: string;
  providerComponentName?: string;
  canInjectProvider: boolean;
  canInjectHook: boolean;
  buildTranslationCall(
    key: string,
    interpolation?: Record<string, t.Expression>
  ): t.Expression;
  buildHookStatement?(): t.Statement;
}

function buildInterpolationObject(
  interpolation?: Record<string, t.Expression>
): t.ObjectExpression | undefined {
  if (!interpolation || Object.keys(interpolation).length === 0) {
    return undefined;
  }

  return t.objectExpression(
    Object.entries(interpolation).map(([name, expression]) =>
      t.objectProperty(t.identifier(name), expression)
    )
  );
}

function buildCallIdentifier(functionName: string): ResolvedAdapter["buildTranslationCall"] {
  return (key, interpolation) => {
    const args: t.Expression[] = [t.stringLiteral(key)];
    const interpolationObject = buildInterpolationObject(interpolation);

    if (interpolationObject) {
      args.push(interpolationObject);
    }

    return t.callExpression(t.identifier(functionName), args);
  };
}

function buildGenericAdapter(config: ResolvedGlobalyzeConfig): ResolvedAdapter {
  return {
    name: config.i18nAdapter,
    importPath: config.translationImportPath,
    translationFunctionName: config.translationFunctionName,
    hookName: config.translationHookName,
    providerImportPath: config.providerImportPath,
    providerComponentName: config.providerComponentName,
    canInjectProvider: false,
    canInjectHook: false,
    buildTranslationCall: buildCallIdentifier(config.translationFunctionName)
  };
}

function buildReactI18nextAdapter(): ResolvedAdapter {
  return {
    name: "react-i18next",
    importPath: "react-i18next",
    translationFunctionName: "t",
    hookName: "useTranslation",
    providerImportPath: "react-i18next",
    providerComponentName: "I18nextProvider",
    canInjectProvider: true,
    canInjectHook: true,
    buildTranslationCall: buildCallIdentifier("t"),
    buildHookStatement: () =>
      t.variableDeclaration("const", [
        t.variableDeclarator(
          t.objectPattern([
            t.objectProperty(t.identifier("t"), t.identifier("t"), false, true)
          ]),
          t.callExpression(t.identifier("useTranslation"), [])
        )
      ])
  };
}

function buildNextIntlAdapter(): ResolvedAdapter {
  return {
    name: "next-intl",
    importPath: "next-intl",
    translationFunctionName: "t",
    hookName: "useTranslations",
    providerImportPath: "next-intl",
    providerComponentName: "NextIntlClientProvider",
    canInjectProvider: true,
    canInjectHook: true,
    buildTranslationCall: buildCallIdentifier("t"),
    buildHookStatement: () =>
      t.variableDeclaration("const", [
        t.variableDeclarator(
          t.identifier("t"),
          t.callExpression(t.identifier("useTranslations"), [])
        )
      ])
  };
}

function buildReactIntlAdapter(): ResolvedAdapter {
  return {
    name: "react-intl",
    importPath: "react-intl",
    translationFunctionName: "t",
    hookName: "useIntl",
    providerImportPath: "react-intl",
    providerComponentName: "IntlProvider",
    canInjectProvider: true,
    canInjectHook: false,
    buildTranslationCall: buildCallIdentifier("t")
  };
}

export function resolveI18nAdapter(
  config: ResolvedGlobalyzeConfig
): ResolvedAdapter {
  if (config.i18nAdapter === "react-i18next") {
    return buildReactI18nextAdapter();
  }

  if (config.i18nAdapter === "next-intl") {
    return buildNextIntlAdapter();
  }

  if (config.i18nAdapter === "react-intl") {
    return buildReactIntlAdapter();
  }

  return buildGenericAdapter(config);
}
