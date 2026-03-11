import path from "node:path";
import { rename } from "node:fs/promises";

import fg from "fast-glob";

import { resolveI18nAdapter } from "../adapters";
import type { ResolvedGlobalyzeConfig } from "../types";
import { pathExists, readTextFile, writeTextFile } from "../utils/fileUtils";
import { formatGeneratedFileContents } from "../utils/projectFormatter";

const DEFAULT_LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  tr: "Türkçe",
  ja: "日本語",
  ko: "한국어",
  zh: "中文",
  ru: "Русский"
};

export interface LanguageArtifactResult {
  labelsPath: string;
  localeHookPath: string;
  switcherPath: string;
  serverRuntimePath: string;
  created: string[];
  updated: string[];
  skipped: string[];
}

export type RuntimeArtifactFlavor = "typescript" | "javascript";

interface RuntimeArtifactPaths {
  labelsPath: string;
  localeHookPath: string;
  switcherPath: string;
  serverRuntimePath: string;
}

function buildLanguageLabelsContents(
  config: ResolvedGlobalyzeConfig,
  flavor: RuntimeArtifactFlavor
): string {
  const labelsEntries = config.languages.map((language) => [
    language,
    DEFAULT_LANGUAGE_LABELS[language] ?? language.toUpperCase()
  ]);

  if (flavor === "javascript") {
    return [
      `export const GLOBALYZE_LANGUAGES = ${JSON.stringify(config.languages)};`,
      "",
      "export const DEFAULT_LANGUAGE_LABELS = {",
      ...labelsEntries.map(
        ([code, label]) => `  ${JSON.stringify(code)}: ${JSON.stringify(label)},`
      ),
      "};",
      "",
      "export function resolveLanguageLabel(language, overrides) {",
      "  return overrides?.[language] ?? DEFAULT_LANGUAGE_LABELS[language] ?? language;",
      "}",
      ""
    ].join("\n");
  }

  return [
    "export const GLOBALYZE_LANGUAGES = " +
      `${JSON.stringify(config.languages)} as const;`,
    "",
    "export type GlobalyzeLanguage = (typeof GLOBALYZE_LANGUAGES)[number];",
    "",
    "export const DEFAULT_LANGUAGE_LABELS: Record<GlobalyzeLanguage, string> = {",
    ...labelsEntries.map(
      ([code, label]) => `  ${JSON.stringify(code)}: ${JSON.stringify(label)},`
    ),
    "};",
    "",
    "export function resolveLanguageLabel(",
    "  language: GlobalyzeLanguage,",
    "  overrides?: Partial<Record<GlobalyzeLanguage, string>>",
    "): string {",
    "  return overrides?.[language] ?? DEFAULT_LANGUAGE_LABELS[language] ?? language;",
    "}",
    ""
  ].join("\n");
}

function buildServerRuntimeContents(
  config: ResolvedGlobalyzeConfig,
  flavor: RuntimeArtifactFlavor
): string {
  const manifestImportPath = "../lib/i18n/translations.generated";
  const defaultLocale = JSON.stringify(config.sourceLocale);
  const isTypeScript = flavor === "typescript";

  if (!isTypeScript) {
    return [
      `import { getTranslations } from ${JSON.stringify(manifestImportPath)};`,
      "",
      `const DEFAULT_LOCALE = ${defaultLocale};`,
      'const STORAGE_KEY = "globalyze.locale";',
      'const COOKIE_KEY = "globalyze.locale";',
      "",
      "function readCookieLocale(cookieSource) {",
      "  if (!cookieSource) {",
      "    return null;",
      "  }",
      "",
      "  const cookies = cookieSource.split(/;\\s*/).filter(Boolean);",
      '  const match = cookies.find((entry) => entry.startsWith(`${COOKIE_KEY}=`));',
      "  return match ? decodeURIComponent(match.slice(COOKIE_KEY.length + 1)) : null;",
      "}",
      "",
      "function readServerCookieLocale() {",
      '  if (typeof window !== "undefined") {',
      "    return null;",
      "  }",
      "",
      "  try {",
      "    const maybeRequire = Function(",
      "      'return typeof require !== \"undefined\" ? require : null;'",
      "    )();",
      "",
      "    if (!maybeRequire) {",
      "      return null;",
      "    }",
      "",
      '    const nextHeaders = maybeRequire("next/headers");',
      "    const cookieStore = typeof nextHeaders.cookies === \"function\" ? nextHeaders.cookies() : null;",
      '    const cookie = cookieStore?.get(COOKIE_KEY);',
      '    return typeof cookie?.value === "string" && cookie.value.trim().length > 0 ? cookie.value : null;',
      "  } catch {",
      "    return null;",
      "  }",
      "}",
      "",
      "export function getCurrentLocale(locale) {",
      "  if (typeof locale === \"string\" && locale.trim().length > 0) {",
      "    return locale;",
      "  }",
      "",
      "  const serverLocale = readServerCookieLocale();",
      "  if (serverLocale) {",
      "    return serverLocale;",
      "  }",
      "",
      '  if (typeof window !== "undefined") {',
      '    const cookieLocale = readCookieLocale(typeof document !== "undefined" ? document.cookie : null);',
      "    if (cookieLocale) {",
      "      return cookieLocale;",
      "    }",
      "",
      "    try {",
      "      const storedLocale = window.localStorage.getItem(STORAGE_KEY);",
      "      if (typeof storedLocale === \"string\" && storedLocale.trim().length > 0) {",
      "        return storedLocale;",
      "      }",
      "    } catch {",
      "      return DEFAULT_LOCALE;",
      "    }",
      "  }",
      "",
      "  return DEFAULT_LOCALE;",
      "}",
      "",
      "export function getCurrentMessages(locale) {",
      "  const activeLocale = getCurrentLocale(locale);",
      "  return getTranslations(activeLocale) ?? getTranslations(DEFAULT_LOCALE) ?? {};",
      "}",
      ""
    ].join("\n");
  }

  return [
    `import { getTranslations } from ${JSON.stringify(manifestImportPath)};`,
    "",
    `const DEFAULT_LOCALE = ${defaultLocale};`,
    'const STORAGE_KEY = "globalyze.locale";',
    'const COOKIE_KEY = "globalyze.locale";',
    "",
    "function readCookieLocale(cookieSource: string | null | undefined): string | null {",
    "  if (!cookieSource) {",
    "    return null;",
    "  }",
    "",
    "  const cookies = cookieSource.split(/;\\s*/).filter(Boolean);",
    '  const match = cookies.find((entry) => entry.startsWith(`${COOKIE_KEY}=`));',
    "  return match ? decodeURIComponent(match.slice(COOKIE_KEY.length + 1)) : null;",
    "}",
    "",
    "function readServerCookieLocale(): string | null {",
    '  if (typeof window !== "undefined") {',
    "    return null;",
    "  }",
    "",
    "  try {",
    "    const maybeRequire = Function(",
    "      'return typeof require !== \"undefined\" ? require : null;'",
    "    )() as ((specifier: string) => unknown) | null;",
    "",
    "    if (!maybeRequire) {",
    "      return null;",
    "    }",
    "",
    "    const nextHeaders = maybeRequire(\"next/headers\") as {",
    "      cookies?: () => { get: (name: string) => { value?: string } | undefined };",
    "    };",
    "    const cookieStore = typeof nextHeaders.cookies === \"function\" ? nextHeaders.cookies() : null;",
    "    const cookie = cookieStore?.get(COOKIE_KEY);",
    '    return typeof cookie?.value === "string" && cookie.value.trim().length > 0 ? cookie.value : null;',
    "  } catch {",
    "    return null;",
    "  }",
    "}",
    "",
    "export function getCurrentLocale(locale?: string): string {",
    "  if (typeof locale === \"string\" && locale.trim().length > 0) {",
    "    return locale;",
    "  }",
    "",
    "  const serverLocale = readServerCookieLocale();",
    "  if (serverLocale) {",
    "    return serverLocale;",
    "  }",
    "",
    '  if (typeof window !== "undefined") {',
    '    const cookieLocale = readCookieLocale(typeof document !== "undefined" ? document.cookie : null);',
    "    if (cookieLocale) {",
    "      return cookieLocale;",
    "    }",
    "",
    "    try {",
    "      const storedLocale = window.localStorage.getItem(STORAGE_KEY);",
    "      if (typeof storedLocale === \"string\" && storedLocale.trim().length > 0) {",
    "        return storedLocale;",
    "      }",
    "    } catch {",
    "      return DEFAULT_LOCALE;",
    "    }",
    "  }",
    "",
    "  return DEFAULT_LOCALE;",
    "}",
    "",
    "export function getCurrentMessages(locale?: string): Record<string, string> {",
    "  const activeLocale = getCurrentLocale(locale);",
    "  return (",
    "    (getTranslations(activeLocale) as Record<string, string> | undefined) ??",
    "    (getTranslations(DEFAULT_LOCALE) as Record<string, string> | undefined) ??",
    "    {}",
    "  );",
    "}",
    ""
  ].join("\n");
}

function buildLocaleHookContents(
  config: ResolvedGlobalyzeConfig,
  flavor: RuntimeArtifactFlavor
): string {
  const adapter = resolveI18nAdapter(config);
  const defaultLocale = JSON.stringify(config.sourceLocale);
  const isTypeScript = flavor === "typescript";

  if (adapter.name === "react-i18next") {
    if (!isTypeScript) {
      return [
        '"use client";',
        "",
        'import { useTranslation } from "react-i18next";',
        "",
        'const STORAGE_KEY = "globalyze.locale";',
        'const COOKIE_KEY = "globalyze.locale";',
        "",
        "export function useLocale() {",
        "  const { i18n } = useTranslation();",
        "",
        "  return {",
        `    locale: i18n.resolvedLanguage ?? i18n.language ?? ${defaultLocale},`,
        "    setLocale: async (locale) => {",
        '      if (typeof window !== "undefined") {',
        "        window.localStorage.setItem(STORAGE_KEY, locale);",
        '        document.cookie = `${COOKIE_KEY}=${encodeURIComponent(locale)}; path=/; max-age=31536000; SameSite=Lax`;',
        "      }",
        "",
        "      await i18n.changeLanguage(locale);",
        "    }",
        "  };",
        "}",
        ""
      ].join("\n");
    }

    return [
      '"use client";',
      "",
      'import { useTranslation } from "react-i18next";',
      "",
      'const STORAGE_KEY = "globalyze.locale";',
      'const COOKIE_KEY = "globalyze.locale";',
      "",
      "export interface GlobalyzeLocaleController {",
      "  locale: string;",
      "  setLocale: (locale: string) => Promise<void>;",
      "}",
      "",
      "export function useLocale(): GlobalyzeLocaleController {",
      "  const { i18n } = useTranslation();",
      "",
      "  return {",
      `    locale: i18n.resolvedLanguage ?? i18n.language ?? ${defaultLocale},`,
      "    setLocale: async (locale: string) => {",
      '      if (typeof window !== "undefined") {',
      "        window.localStorage.setItem(STORAGE_KEY, locale);",
      '        document.cookie = `${COOKIE_KEY}=${encodeURIComponent(locale)}; path=/; max-age=31536000; SameSite=Lax`;',
      "      }",
      "",
      "      await i18n.changeLanguage(locale);",
      "    }",
      "  };",
      "}",
      ""
    ].join("\n");
  }

  if (adapter.name === "next-intl") {
    if (!isTypeScript) {
      return [
        '"use client";',
        "",
        'import { useLocale as useNextIntlLocale } from "next-intl";',
        'import { usePathname, useRouter } from "next/navigation";',
        "",
        "function replaceLocaleInPathname(pathname, nextLocale) {",
        "  const segments = pathname.split(\"/\").filter(Boolean);",
        "",
        "  if (segments.length === 0) {",
        "    return `/${nextLocale}`;",
        "  }",
        "",
        `  const knownLocales = new Set(${JSON.stringify(config.languages)});`,
        "  if (knownLocales.has(segments[0] ?? \"\")) {",
        "    segments[0] = nextLocale;",
        "  } else {",
        "    segments.unshift(nextLocale);",
        "  }",
        "",
        "  return `/${segments.join(\"/\")}`;",
        "}",
        "",
        "export function useLocale() {",
        "  const locale = useNextIntlLocale();",
        "  const router = useRouter();",
        "  const pathname = usePathname();",
        "",
        "  return {",
        "    locale,",
        "    setLocale: (nextLocale) => {",
      "      if (typeof window === \"undefined\") {",
        "        return;",
        "      }",
        "",
        '      window.localStorage.setItem("globalyze.locale", nextLocale);',
        '      document.cookie = `globalyze.locale=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; SameSite=Lax`;',
        "      const nextPath = replaceLocaleInPathname(pathname ?? window.location.pathname, nextLocale);",
        "      router.replace(`${nextPath}${window.location.search}${window.location.hash}`);",
        "      router.refresh();",
        "    }",
        "  };",
        "}",
        ""
      ].join("\n");
    }

    return [
      '"use client";',
      "",
      'import { useLocale as useNextIntlLocale } from "next-intl";',
      'import { usePathname, useRouter } from "next/navigation";',
      "",
      "export interface GlobalyzeLocaleController {",
      "  locale: string;",
      "  setLocale: (locale: string) => void;",
      "}",
      "",
      "function replaceLocaleInPathname(pathname: string, nextLocale: string): string {",
      "  const segments = pathname.split(\"/\").filter(Boolean);",
      "",
      "  if (segments.length === 0) {",
      "    return `/${nextLocale}`;",
      "  }",
      "",
      `  const knownLocales = new Set(${JSON.stringify(config.languages)});`,
      "  if (knownLocales.has(segments[0] ?? \"\")) {",
      "    segments[0] = nextLocale;",
      "  } else {",
      "    segments.unshift(nextLocale);",
      "  }",
      "",
      "  return `/${segments.join(\"/\")}`;",
      "}",
      "",
      "export function useLocale(): GlobalyzeLocaleController {",
      "  const locale = useNextIntlLocale();",
      "  const router = useRouter();",
      "  const pathname = usePathname();",
      "",
      "  return {",
      "    locale,",
      "    setLocale: (nextLocale: string) => {",
      "      if (typeof window === \"undefined\") {",
        "        return;",
      "      }",
      "",
      '      window.localStorage.setItem("globalyze.locale", nextLocale);',
      '      document.cookie = `globalyze.locale=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; SameSite=Lax`;',
      "      const nextPath = replaceLocaleInPathname(pathname ?? window.location.pathname, nextLocale);",
      "      router.replace(`${nextPath}${window.location.search}${window.location.hash}`);",
      "      router.refresh();",
      "    }",
      "  };",
      "}",
      ""
    ].join("\n");
  }

  const customComment =
    adapter.name === "custom"
      ? [
          "  // TODO: connect this provider state to your custom i18n runtime.",
          "  // TODO: replace the storage-based fallback once your runtime is wired."
        ]
      : adapter.name === "react-intl"
      ? [
            "  // TODO: connect this state to your react-intl provider messages and locale props."
          ]
        : [];

  if (!isTypeScript) {
    return [
      '"use client";',
      "",
      'import * as React from "react";',
      "",
      `const DEFAULT_LOCALE = ${defaultLocale};`,
      'const STORAGE_KEY = "globalyze.locale";',
      'const COOKIE_KEY = "globalyze.locale";',
      "",
      "const GlobalyzeLocaleContext = React.createContext(null);",
      "",
      "function readCookieLocale() {",
      '  if (typeof document === "undefined") {',
      "    return null;",
      "  }",
      "",
      "  const cookies = document.cookie.split(/;\\s*/).filter(Boolean);",
      '  const match = cookies.find((entry) => entry.startsWith(`${COOKIE_KEY}=`));',
      "  return match ? decodeURIComponent(match.slice(COOKIE_KEY.length + 1)) : null;",
      "}",
      "",
      "function readStoredLocale(initialLocale) {",
      "  if (typeof initialLocale === \"string\" && initialLocale.trim().length > 0) {",
      "    return initialLocale;",
      "  }",
      "",
      "  return DEFAULT_LOCALE;",
      "}",
      "",
      "function persistLocale(nextLocale) {",
      '  if (typeof window === "undefined") {',
      "    return;",
      "  }",
      "",
      "  window.localStorage.setItem(STORAGE_KEY, nextLocale);",
      '  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; SameSite=Lax`;',
      "}",
      "",
      "export function GlobalyzeLocaleProvider({ children, initialLocale }) {",
      "  const [locale, setLocaleState] = React.useState(() => readStoredLocale(initialLocale));",
      "",
      "  React.useEffect(() => {",
      "    if (typeof window === \"undefined\") {",
      "      return undefined;",
      "    }",
      "",
      "    setLocaleState(readCookieLocale() ?? window.localStorage.getItem(STORAGE_KEY) ?? readStoredLocale(initialLocale));",
      "",
      "    const handleStorage = () => {",
      "      setLocaleState(readCookieLocale() ?? window.localStorage.getItem(STORAGE_KEY) ?? readStoredLocale(initialLocale));",
      "    };",
      "",
      '    window.addEventListener("storage", handleStorage);',
      '    window.addEventListener("globalyze:locale-change", handleStorage);',
      "    return () => {",
      '      window.removeEventListener("storage", handleStorage);',
      '      window.removeEventListener("globalyze:locale-change", handleStorage);',
      "    };",
      "  }, [initialLocale]);",
      "",
      "  const setLocale = React.useCallback((nextLocale) => {",
      "    setLocaleState(nextLocale);",
      "",
      "    if (typeof window !== \"undefined\") {",
      "      persistLocale(nextLocale);",
      '      window.dispatchEvent(new CustomEvent("globalyze:locale-change"));',
      "      window.setTimeout(() => {",
      "        window.location.reload();",
      "      }, 0);",
      "    }",
      "  }, []);",
      "",
      ...customComment,
      "",
      "  return (",
      "    <GlobalyzeLocaleContext.Provider value={{ locale, setLocale }}>",
      "      {children}",
      "    </GlobalyzeLocaleContext.Provider>",
      "  );",
      "}",
      "",
      "export function useLocale() {",
      "  const context = React.useContext(GlobalyzeLocaleContext);",
      "",
      "  if (!context) {",
      '    throw new Error("useLocale must be used within GlobalyzeLocaleProvider.");',
      "  }",
      "",
      "  return context;",
      "}",
      ""
    ].join("\n");
  }

  return [
    '"use client";',
    "",
    'import * as React from "react";',
    "",
    "export interface GlobalyzeLocaleController {",
    "  locale: string;",
    "  setLocale: (locale: string) => void;",
    "}",
    "",
    `const DEFAULT_LOCALE = ${defaultLocale};`,
    'const STORAGE_KEY = "globalyze.locale";',
    'const COOKIE_KEY = "globalyze.locale";',
    "",
    "const GlobalyzeLocaleContext = React.createContext<GlobalyzeLocaleController | null>(null);",
    "",
    "function readCookieLocale(): string | null {",
    '  if (typeof document === "undefined") {',
    "    return null;",
    "  }",
    "",
    "  const cookies = document.cookie.split(/;\\s*/).filter(Boolean);",
    '  const match = cookies.find((entry) => entry.startsWith(`${COOKIE_KEY}=`));',
    "  return match ? decodeURIComponent(match.slice(COOKIE_KEY.length + 1)) : null;",
    "}",
    "",
      "function readStoredLocale(initialLocale?: string): string {",
      "  if (typeof initialLocale === \"string\" && initialLocale.trim().length > 0) {",
      "    return initialLocale;",
      "  }",
      "",
      "  return DEFAULT_LOCALE;",
    "}",
    "",
    "function persistLocale(nextLocale: string): void {",
    '  if (typeof window === "undefined") {',
    "    return;",
    "  }",
    "",
    "  window.localStorage.setItem(STORAGE_KEY, nextLocale);",
    '  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; SameSite=Lax`;',
    "}",
    "",
    "export function GlobalyzeLocaleProvider(",
    "  { children, initialLocale }: { children: React.ReactNode; initialLocale?: string }",
    ") {",
    "  const [locale, setLocaleState] = React.useState<string>(() => readStoredLocale(initialLocale));",
    "",
    "  React.useEffect(() => {",
    "    if (typeof window === \"undefined\") {",
    "      return undefined;",
    "    }",
    "",
    "    setLocaleState(readCookieLocale() ?? window.localStorage.getItem(STORAGE_KEY) ?? readStoredLocale(initialLocale));",
    "",
    "    const handleStorage = () => {",
    "      setLocaleState(readCookieLocale() ?? window.localStorage.getItem(STORAGE_KEY) ?? readStoredLocale(initialLocale));",
    "    };",
    "",
    '    window.addEventListener("storage", handleStorage);',
    '    window.addEventListener("globalyze:locale-change", handleStorage as EventListener);',
    "    return () => {",
    '      window.removeEventListener("storage", handleStorage);',
    '      window.removeEventListener("globalyze:locale-change", handleStorage as EventListener);',
    "    };",
    "  }, [initialLocale]);",
    "",
    "  const setLocale = React.useCallback((nextLocale: string) => {",
    "    setLocaleState(nextLocale);",
    "",
    "    if (typeof window !== \"undefined\") {",
    "      persistLocale(nextLocale);",
    '      window.dispatchEvent(new CustomEvent("globalyze:locale-change"));',
    "      window.setTimeout(() => {",
    "        window.location.reload();",
    "      }, 0);",
    "    }",
    "  }, []);",
    "",
    ...customComment,
    "",
    "  return (",
    "    <GlobalyzeLocaleContext.Provider value={{ locale, setLocale }}>",
    "      {children}",
    "    </GlobalyzeLocaleContext.Provider>",
    "  );",
    "}",
    "",
    "export function useLocale(): GlobalyzeLocaleController {",
    "  const context = React.useContext(GlobalyzeLocaleContext);",
    "",
    "  if (!context) {",
    '    throw new Error("useLocale must be used within GlobalyzeLocaleProvider.");',
    "  }",
    "",
    "  return context;",
    "}",
    ""
  ].join("\n");
}

function buildLanguageSwitcherContents(
  flavor: RuntimeArtifactFlavor
): string {
  const relativeHookImport = "../i18n/useLocale";
  const relativeLabelsImport = "../runtime/languageLabels";

  if (flavor === "javascript") {
    return [
      '"use client";',
      "",
      'import * as React from "react";',
      `import { useLocale } from ${JSON.stringify(relativeHookImport)};`,
      `import {`,
      "  GLOBALYZE_LANGUAGES,",
      "  resolveLanguageLabel",
      `} from ${JSON.stringify(relativeLabelsImport)};`,
      "",
      "export function GlobalyzeLanguageSwitcher({ labels, className }) {",
      "  const { locale, setLocale } = useLocale();",
      "",
      "  return (",
      '    <select',
      "      className={className}",
      "      value={locale}",
      "      onChange={(event) => {",
      "        void setLocale(event.target.value);",
      "      }}",
      "    >",
      "      {GLOBALYZE_LANGUAGES.map((language) => (",
      "        <option key={language} value={language}>",
      "          {resolveLanguageLabel(language, labels)}",
      "        </option>",
      "      ))}",
      "    </select>",
      "  );",
      "}",
      ""
    ].join("\n");
  }

  return [
    '"use client";',
    "",
    'import * as React from "react";',
    `import { useLocale } from ${JSON.stringify(relativeHookImport)};`,
    `import {`,
    "  GLOBALYZE_LANGUAGES,",
    "  resolveLanguageLabel,",
    "  type GlobalyzeLanguage",
    `} from ${JSON.stringify(relativeLabelsImport)};`,
    "",
    "export interface GlobalyzeLanguageSwitcherProps {",
    "  labels?: Partial<Record<GlobalyzeLanguage, string>>;",
    '  className?: string;',
    "}",
    "",
    "export function GlobalyzeLanguageSwitcher(",
    "  { labels, className }: GlobalyzeLanguageSwitcherProps",
    ") {",
    "  const { locale, setLocale } = useLocale();",
    "",
    "  return (",
    '    <select',
    "      className={className}",
    "      value={locale}",
    "      onChange={(event) => {",
    "        void setLocale(event.target.value);",
    "      }}",
    "    >",
    "      {GLOBALYZE_LANGUAGES.map((language) => (",
    "        <option key={language} value={language}>",
    "          {resolveLanguageLabel(language, labels)}",
    "        </option>",
    "      ))}",
    "    </select>",
    "  );",
    "}",
    ""
  ].join("\n");
}

async function writeGeneratedArtifact(
  filePath: string,
  contents: string,
  validator: (contents: string) => boolean
): Promise<"created" | "updated" | "skipped"> {
  const formattedContents = await formatGeneratedFileContents(filePath, contents);

  if (!(await pathExists(filePath))) {
    await writeTextFile(filePath, formattedContents);
    return "created";
  }

  const existingContents = await readTextFile(filePath);

  if (!validator(existingContents)) {
    return "skipped";
  }

  if (
    existingContents === formattedContents ||
    existingContents === `${formattedContents}\n`
  ) {
    return "skipped";
  }

  await writeTextFile(filePath, formattedContents);
  return "updated";
}

function isGeneratedLocaleHook(contents: string): boolean {
  return (
    contents.includes("GlobalyzeLocaleProvider") &&
    contents.includes("GlobalyzeLocaleContext") &&
    contents.includes('"use client";')
  );
}

function isGeneratedLanguageSwitcher(contents: string): boolean {
  return (
    contents.includes("GlobalyzeLanguageSwitcher") &&
    contents.includes("resolveLanguageLabel") &&
    contents.includes("useLocale")
  );
}

function isGeneratedLanguageLabels(contents: string): boolean {
  return (
    contents.includes("GLOBALYZE_LANGUAGES") &&
    contents.includes("DEFAULT_LANGUAGE_LABELS") &&
    contents.includes("resolveLanguageLabel")
  );
}

function isGeneratedServerRuntime(contents: string): boolean {
  return (
    contents.includes("getCurrentLocale") &&
    contents.includes("getCurrentMessages") &&
    contents.includes("translations.generated")
  );
}

async function migrateLegacyLocaleHook(
  legacyPath: string,
  nextPath: string,
  validator: (contents: string) => boolean
): Promise<"created" | "skipped"> {
  if (await pathExists(nextPath)) {
    return "skipped";
  }

  if (!(await pathExists(legacyPath))) {
    return "skipped";
  }

  const contents = await readTextFile(legacyPath);

  if (!validator(contents)) {
    return "skipped";
  }

  await rename(legacyPath, nextPath);
  return "created";
}

export async function detectRuntimeArtifactFlavor(
  config: ResolvedGlobalyzeConfig
): Promise<RuntimeArtifactFlavor> {
  if (await pathExists(path.join(config.rootDir, "tsconfig.json"))) {
    return "typescript";
  }

  const typeScriptCandidates = [
    path.join(config.rootDir, "app", "layout.tsx"),
    path.join(config.rootDir, "app", "layout.ts"),
    path.join(config.rootDir, "app", "root.tsx"),
    path.join(config.rootDir, "pages", "_app.tsx"),
    path.join(config.rootDir, "pages", "_app.ts"),
    path.join(config.sourceDir, "app", "layout.tsx"),
    path.join(config.sourceDir, "app", "layout.ts"),
    path.join(config.sourceDir, "pages", "_app.tsx"),
    path.join(config.sourceDir, "pages", "_app.ts"),
    path.join(config.sourceDir, "routes", "__root.tsx"),
    path.join(config.sourceDir, "routes", "__root.ts"),
    path.join(config.rootDir, "app", "root.tsx"),
    path.join(config.rootDir, "app", "root.ts"),
    path.join(config.sourceDir, "main.tsx"),
    path.join(config.sourceDir, "main.ts"),
    path.join(config.sourceDir, "index.tsx"),
    path.join(config.sourceDir, "index.ts")
  ];

  for (const candidate of typeScriptCandidates) {
    if (await pathExists(candidate)) {
      return "typescript";
    }
  }

  const javascriptCandidates = [
    path.join(config.rootDir, "app", "layout.jsx"),
    path.join(config.rootDir, "app", "layout.js"),
    path.join(config.rootDir, "app", "root.jsx"),
    path.join(config.rootDir, "app", "root.js"),
    path.join(config.rootDir, "pages", "_app.jsx"),
    path.join(config.rootDir, "pages", "_app.js"),
    path.join(config.sourceDir, "app", "layout.jsx"),
    path.join(config.sourceDir, "app", "layout.js"),
    path.join(config.sourceDir, "pages", "_app.jsx"),
    path.join(config.sourceDir, "pages", "_app.js"),
    path.join(config.sourceDir, "routes", "__root.jsx"),
    path.join(config.sourceDir, "routes", "__root.js"),
    path.join(config.sourceDir, "main.jsx"),
    path.join(config.sourceDir, "main.js"),
    path.join(config.sourceDir, "index.jsx"),
    path.join(config.sourceDir, "index.js")
  ];

  for (const candidate of javascriptCandidates) {
    if (await pathExists(candidate)) {
      return "javascript";
    }
  }

  const typeScriptSourceFiles = await fg(["**/*.{ts,tsx}"], {
    cwd: config.sourceDir,
    absolute: true,
    onlyFiles: true,
    ignore: [...config.ignore.map((segment) => `${segment}/**`), "locales/**"]
  });

  if (typeScriptSourceFiles.length > 0) {
    return "typescript";
  }

  const javascriptSourceFiles = await fg(["**/*.{js,jsx}"], {
    cwd: config.sourceDir,
    absolute: true,
    onlyFiles: true,
    ignore: [...config.ignore.map((segment) => `${segment}/**`), "locales/**"]
  });

  if (javascriptSourceFiles.length > 0) {
    return "javascript";
  }

  if (await pathExists(path.join(config.rootDir, "jsconfig.json"))) {
    return "javascript";
  }

  return config.localeStructure.format === "ts" ? "typescript" : "javascript";
}

function resolveRuntimeArtifactPaths(
  config: ResolvedGlobalyzeConfig,
  flavor: RuntimeArtifactFlavor
): RuntimeArtifactPaths {
  const labelsExtension = flavor === "typescript" ? "ts" : "js";
  const jsxExtension = flavor === "typescript" ? "tsx" : "jsx";

  return {
    labelsPath: path.join(config.sourceDir, "runtime", `languageLabels.${labelsExtension}`),
    localeHookPath: path.join(config.sourceDir, "i18n", `useLocale.${jsxExtension}`),
    switcherPath: path.join(
      config.sourceDir,
      "components",
      `GlobalyzeLanguageSwitcher.${jsxExtension}`
    ),
    serverRuntimePath: path.join(config.sourceDir, "i18n", `runtime.${labelsExtension}`)
  };
}

export async function ensureLanguageArtifacts(
  config: ResolvedGlobalyzeConfig
): Promise<LanguageArtifactResult> {
  const flavor = await detectRuntimeArtifactFlavor(config);
  const { labelsPath, localeHookPath, switcherPath, serverRuntimePath } = resolveRuntimeArtifactPaths(
    config,
    flavor
  );
  const legacyLocaleHookPaths = [
    path.join(config.sourceDir, "i18n", "useLocale.ts"),
    path.join(config.sourceDir, "i18n", "useLocale.tsx"),
    path.join(config.sourceDir, "i18n", "useLocale.js"),
    path.join(config.sourceDir, "i18n", "useLocale.jsx")
  ].filter((filePath) => filePath !== localeHookPath);
  const legacyLabelsPaths = [
    path.join(config.sourceDir, "runtime", "languageLabels.ts"),
    path.join(config.sourceDir, "runtime", "languageLabels.js")
  ].filter((filePath) => filePath !== labelsPath);
  const legacySwitcherPaths = [
    path.join(config.sourceDir, "components", "GlobalyzeLanguageSwitcher.tsx"),
    path.join(config.sourceDir, "components", "GlobalyzeLanguageSwitcher.jsx")
  ].filter((filePath) => filePath !== switcherPath);
  const legacyServerRuntimePaths = [
    path.join(config.sourceDir, "i18n", "runtime.ts"),
    path.join(config.sourceDir, "i18n", "runtime.js")
  ].filter((filePath) => filePath !== serverRuntimePath);

  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const legacyPath of legacyLocaleHookPaths) {
    const legacyMigrationResult = await migrateLegacyLocaleHook(
      legacyPath,
      localeHookPath,
      isGeneratedLocaleHook
    );

    if (legacyMigrationResult === "created") {
      created.push(localeHookPath);
      break;
    }
  }

  if (!created.includes(labelsPath)) {
    for (const legacyPath of legacyLabelsPaths) {
      const legacyMigrationResult = await migrateLegacyLocaleHook(
        legacyPath,
        labelsPath,
        isGeneratedLanguageLabels
      );

      if (legacyMigrationResult === "created") {
        created.push(labelsPath);
        break;
      }
    }
  }

  if (!created.includes(switcherPath)) {
    for (const legacyPath of legacySwitcherPaths) {
      const legacyMigrationResult = await migrateLegacyLocaleHook(
        legacyPath,
        switcherPath,
        isGeneratedLanguageSwitcher
      );

      if (legacyMigrationResult === "created") {
        created.push(switcherPath);
        break;
      }
    }
  }

  if (!created.includes(serverRuntimePath)) {
    for (const legacyPath of legacyServerRuntimePaths) {
      const legacyMigrationResult = await migrateLegacyLocaleHook(
        legacyPath,
        serverRuntimePath,
        isGeneratedServerRuntime
      );

      if (legacyMigrationResult === "created") {
        created.push(serverRuntimePath);
        break;
      }
    }
  }

  const writes = [
    {
      path: labelsPath,
      contents: buildLanguageLabelsContents(config, flavor),
      validator: isGeneratedLanguageLabels
    },
    {
      path: localeHookPath,
      contents: buildLocaleHookContents(config, flavor),
      validator: isGeneratedLocaleHook
    },
    {
      path: switcherPath,
      contents: buildLanguageSwitcherContents(flavor),
      validator: isGeneratedLanguageSwitcher
    },
    {
      path: serverRuntimePath,
      contents: buildServerRuntimeContents(config, flavor),
      validator: isGeneratedServerRuntime
    }
  ] as const;

  for (const file of writes) {
    if (created.includes(file.path)) {
      continue;
    }

    const result = await writeGeneratedArtifact(
      file.path,
      file.contents,
      file.validator
    );

    if (result === "created") {
      created.push(file.path);
    } else if (result === "updated") {
      updated.push(file.path);
    } else {
      skipped.push(file.path);
    }
  }

  return {
    labelsPath,
    localeHookPath,
    switcherPath,
    serverRuntimePath,
    created,
    updated,
    skipped
  };
}
