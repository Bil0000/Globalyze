import path from "node:path";

import { resolveI18nAdapter } from "../adapters";
import type { ResolvedGlobalyzeConfig } from "../types";
import { pathExists, writeTextFile } from "../utils/fileUtils";

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
  created: string[];
  skipped: string[];
}

function buildLanguageLabelsContents(config: ResolvedGlobalyzeConfig): string {
  const labelsEntries = config.languages.map((language) => [
    language,
    DEFAULT_LANGUAGE_LABELS[language] ?? language.toUpperCase()
  ]);

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

function buildLocaleHookContents(config: ResolvedGlobalyzeConfig): string {
  const adapter = resolveI18nAdapter(config);
  const defaultLocale = JSON.stringify(config.sourceLocale);

  if (adapter.name === "react-i18next") {
    return [
      '"use client";',
      "",
      'import { useTranslation } from "react-i18next";',
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
      "      await i18n.changeLanguage(locale);",
      "    }",
      "  };",
      "}",
      ""
    ].join("\n");
  }

  if (adapter.name === "next-intl") {
    return [
      '"use client";',
      "",
      'import { useLocale as useNextIntlLocale } from "next-intl";',
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
      "",
      "  return {",
      "    locale,",
      "    setLocale: (nextLocale: string) => {",
      "      if (typeof window === \"undefined\") {",
      "        return;",
      "      }",
      "",
      "      const nextPath = replaceLocaleInPathname(window.location.pathname, nextLocale);",
      "      window.location.assign(`${nextPath}${window.location.search}${window.location.hash}`);",
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
    "",
    "const GlobalyzeLocaleContext = React.createContext<GlobalyzeLocaleController | null>(null);",
    "",
    "function readStoredLocale(): string {",
    "  if (typeof window === \"undefined\") {",
    "    return DEFAULT_LOCALE;",
    "  }",
    "",
    "  return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_LOCALE;",
    "}",
    "",
    "export function GlobalyzeLocaleProvider(",
    "  { children }: { children: React.ReactNode }",
    ") {",
    "  const [locale, setLocaleState] = React.useState<string>(readStoredLocale);",
    "",
    "  React.useEffect(() => {",
    "    if (typeof window === \"undefined\") {",
    "      return undefined;",
    "    }",
    "",
    "    const handleStorage = () => {",
    "      setLocaleState(readStoredLocale());",
    "    };",
    "",
    '    window.addEventListener("storage", handleStorage);',
    '    window.addEventListener("globalyze:locale-change", handleStorage as EventListener);',
    "    return () => {",
    '      window.removeEventListener("storage", handleStorage);',
    '      window.removeEventListener("globalyze:locale-change", handleStorage as EventListener);',
    "    };",
    "  }, []);",
    "",
    "  const setLocale = React.useCallback((nextLocale: string) => {",
    "    setLocaleState(nextLocale);",
    "",
    "    if (typeof window !== \"undefined\") {",
    "      window.localStorage.setItem(STORAGE_KEY, nextLocale);",
    '      window.dispatchEvent(new CustomEvent("globalyze:locale-change"));',
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

function buildLanguageSwitcherContents(): string {
  const relativeHookImport = "../i18n/useLocale";
  const relativeLabelsImport = "../runtime/languageLabels";

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

async function writeIfMissing(
  filePath: string,
  contents: string
): Promise<"created" | "skipped"> {
  if (await pathExists(filePath)) {
    return "skipped";
  }

  await writeTextFile(filePath, contents);
  return "created";
}

export async function ensureLanguageArtifacts(
  config: ResolvedGlobalyzeConfig
): Promise<LanguageArtifactResult> {
  const labelsPath = path.join(config.sourceDir, "runtime", "languageLabels.ts");
  const localeHookPath = path.join(config.sourceDir, "i18n", "useLocale.ts");
  const switcherPath = path.join(
    config.sourceDir,
    "components",
    "GlobalyzeLanguageSwitcher.tsx"
  );

  const created: string[] = [];
  const skipped: string[] = [];

  const writes = [
    {
      path: labelsPath,
      contents: buildLanguageLabelsContents(config)
    },
    {
      path: localeHookPath,
      contents: buildLocaleHookContents(config)
    },
    {
      path: switcherPath,
      contents: buildLanguageSwitcherContents()
    }
  ] as const;

  for (const file of writes) {
    const result = await writeIfMissing(file.path, file.contents);

    if (result === "created") {
      created.push(file.path);
    } else {
      skipped.push(file.path);
    }
  }

  return {
    labelsPath,
    localeHookPath,
    switcherPath,
    created,
    skipped
  };
}
