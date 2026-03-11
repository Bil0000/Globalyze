import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { setupRuntimeProvider } from "../src/runtime/providerWiring";
import { detectFramework } from "../src/utils/frameworkDetection";
import { detectPackageManager } from "../src/utils/packageManager";
import { createTestConfig } from "./testUtils";

describe("runtime setup", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
  });

  it("detects the project package manager using lockfile precedence", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-pm-"));
    tempDirectories.push(rootDir);

    await writeFile(path.join(rootDir, "bun.lockb"), "");
    await writeFile(path.join(rootDir, "pnpm-lock.yaml"), "");

    const packageManager = await detectPackageManager(rootDir);

    expect(packageManager.name).toBe("bun");
    expect(packageManager.installCommand).toBe("bun add");
  });

  it("detects supported frameworks from dependencies and file structure", async () => {
    const nextRoot = await mkdtemp(path.join(tmpdir(), "globalyze-next-"));
    tempDirectories.push(nextRoot);
    await mkdir(path.join(nextRoot, "src", "app"), { recursive: true });
    await writeFile(
      path.join(nextRoot, "package.json"),
      JSON.stringify({ dependencies: { next: "15.0.0", react: "19.0.0" } })
    );

    const viteRoot = await mkdtemp(path.join(tmpdir(), "globalyze-vite-"));
    tempDirectories.push(viteRoot);
    await writeFile(
      path.join(viteRoot, "package.json"),
      JSON.stringify({ dependencies: { vite: "6.0.0", react: "19.0.0" } })
    );

    const remixRoot = await mkdtemp(path.join(tmpdir(), "globalyze-remix-"));
    tempDirectories.push(remixRoot);
    await mkdir(path.join(remixRoot, "app"), { recursive: true });
    await writeFile(
      path.join(remixRoot, "package.json"),
      JSON.stringify({
        dependencies: {
          "@remix-run/react": "2.0.0",
          react: "19.0.0"
        }
      })
    );
    await writeFile(path.join(remixRoot, "app", "root.tsx"), "export default function Root() { return null; }\n");

    const tanStackRoot = await mkdtemp(path.join(tmpdir(), "globalyze-tanstack-"));
    tempDirectories.push(tanStackRoot);
    await mkdir(path.join(tanStackRoot, "src", "app"), { recursive: true });
    await writeFile(
      path.join(tanStackRoot, "package.json"),
      JSON.stringify({
        dependencies: {
          "@tanstack/start": "1.0.0",
          react: "19.0.0"
        }
      })
    );
    await writeFile(
      path.join(tanStackRoot, "src", "app", "__root.tsx"),
      "export default function Root() { return null; }\n"
    );

    const reactRouterRoot = await mkdtemp(
      path.join(tmpdir(), "globalyze-react-router-")
    );
    tempDirectories.push(reactRouterRoot);
    await mkdir(path.join(reactRouterRoot, "app"), { recursive: true });
    await writeFile(
      path.join(reactRouterRoot, "package.json"),
      JSON.stringify({
        dependencies: {
          "@react-router/dev": "7.0.0",
          "react-router": "7.0.0",
          react: "19.0.0"
        }
      })
    );
    await writeFile(
      path.join(reactRouterRoot, "app", "root.tsx"),
      'import { Outlet } from "react-router"; export default function Root() { return <Outlet />; }\n'
    );

    expect(await detectFramework(nextRoot)).toBe("next-app-router");
    expect(await detectFramework(viteRoot)).toBe("vite-react");
    expect(await detectFramework(remixRoot)).toBe("remix");
    expect(await detectFramework(tanStackRoot)).toBe("tanstack-start");
    expect(await detectFramework(reactRouterRoot)).toBe("react-router");

    const remixSrcRoot = await mkdtemp(
      path.join(tmpdir(), "globalyze-remix-src-root-")
    );
    tempDirectories.push(remixSrcRoot);
    await mkdir(path.join(remixSrcRoot, "src", "app"), { recursive: true });
    await writeFile(
      path.join(remixSrcRoot, "package.json"),
      JSON.stringify({
        dependencies: {
          "@remix-run/react": "2.0.0",
          react: "19.0.0"
        }
      })
    );
    await writeFile(
      path.join(remixSrcRoot, "src", "app", "root.tsx"),
      "export default function Root() { return null; }\n"
    );
    expect(await detectFramework(remixSrcRoot)).toBe("remix");

    const reactRouterRoutesRoot = await mkdtemp(
      path.join(tmpdir(), "globalyze-react-router-routes-")
    );
    tempDirectories.push(reactRouterRoutesRoot);
    await mkdir(path.join(reactRouterRoutesRoot, "src", "routes"), {
      recursive: true
    });
    await writeFile(
      path.join(reactRouterRoutesRoot, "package.json"),
      JSON.stringify({
        dependencies: {
          "react-router-dom": "7.0.0",
          react: "19.0.0"
        }
      })
    );
    expect(await detectFramework(reactRouterRoutesRoot)).toBe("react-router");
  });

  it("injects a provider into a Next.js app router layout when safe", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-provider-"));
    tempDirectories.push(rootDir);

    const layoutPath = path.join(rootDir, "src", "app", "layout.tsx");
    await mkdir(path.dirname(layoutPath), { recursive: true });
    await writeFile(
      path.join(rootDir, "package.json"),
      JSON.stringify({ dependencies: { next: "15.0.0", react: "19.0.0" } })
    );
    await writeFile(
      layoutPath,
      [
        "export default function RootLayout({ children }: { children: React.ReactNode }) {",
        "  return (",
        "    <html>",
        "      <body>{children}</body>",
        "    </html>",
        "  );",
        "}",
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir, {
      i18nAdapter: "next-intl"
    });
    const result = await setupRuntimeProvider(
      config,
      { name: "pnpm", installCommand: "pnpm add" },
      { confirmWiring: true }
    );
    const updatedLayout = await readFile(layoutPath, "utf8");
    const languageSwitcher = await readFile(
      path.join(rootDir, "src", "components", "GlobalyzeLanguageSwitcher.tsx"),
      "utf8"
    );
    const localeHook = await readFile(
      path.join(rootDir, "src", "i18n", "useLocale.tsx"),
      "utf8"
    );
    const languageLabels = await readFile(
      path.join(rootDir, "src", "runtime", "languageLabels.ts"),
      "utf8"
    );

    expect(result.wired).toBe(true);
    expect(updatedLayout).toContain('import { NextIntlClientProvider } from "next-intl";');
    expect(updatedLayout).toContain("<NextIntlClientProvider");
    expect(updatedLayout).toContain("locale={getCurrentLocale()}");
    expect(updatedLayout).toContain("messages={getCurrentMessages()}");
    expect(updatedLayout).toContain('import { getCurrentLocale, getCurrentMessages } from "../i18n/runtime";');
    expect(updatedLayout).toContain("GlobalyzeLanguageSwitcher");
    expect(languageSwitcher).toContain("export function GlobalyzeLanguageSwitcher");
    expect(localeHook).toContain('import { useLocale as useNextIntlLocale } from "next-intl";');
    expect(localeHook).toContain('import { usePathname, useRouter, useSearchParams } from "next/navigation";');
    expect(localeHook).toContain("const searchParams = useSearchParams();");
    const serverRuntime = await readFile(
      path.join(rootDir, "src", "i18n", "runtime.ts"),
      "utf8"
    );
    expect(serverRuntime).toContain("getCurrentMessages");
    expect(serverRuntime).toContain("x-next-intl-locale");
    expect(serverRuntime).toContain("accept-language");
    expect(languageLabels).toContain("DEFAULT_LANGUAGE_LABELS");
    expect(result.devSwitcherInjected).toBe(true);
  });

  it("injects a provider into a Next.js app router layout with an existing provider tree", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-provider-nested-"));
    tempDirectories.push(rootDir);

    const layoutPath = path.join(rootDir, "src", "app", "layout.tsx");
    await mkdir(path.dirname(layoutPath), { recursive: true });
    await writeFile(
      path.join(rootDir, "package.json"),
      JSON.stringify({ dependencies: { next: "15.0.0", react: "19.0.0" } })
    );
    await writeFile(
      layoutPath,
      [
        'import { TooltipProvider } from "@/components/ui/tooltip";',
        'import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";',
        'import { ThemeBootScript } from "@/scripts/theme-boot";',
        "",
        "export default function RootLayout({ children }: { children: React.ReactNode }) {",
        "  return (",
        '    <html lang="en">',
        "      <head>",
        "        <ThemeBootScript />",
        "      </head>",
        "      <body>",
        "        <TooltipProvider>",
        "          <PreferencesStoreProvider>",
        "            {children}",
        "          </PreferencesStoreProvider>",
        "        </TooltipProvider>",
        "      </body>",
        "    </html>",
        "  );",
        "}",
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir, {
      i18nAdapter: "generic"
    });
    const result = await setupRuntimeProvider(
      config,
      { name: "pnpm", installCommand: "pnpm add" },
      { confirmWiring: true }
    );
    const updatedLayout = await readFile(layoutPath, "utf8");

    expect(result.wired).toBe(true);
    expect(updatedLayout).toContain("<GlobalyzeLocaleProvider initialLocale={getCurrentLocale()}>");
    expect(updatedLayout).toContain("initialLocale={getCurrentLocale()}");
    expect(updatedLayout).toContain('import { getCurrentLocale } from "@/i18n";');
    expect(updatedLayout).toContain("<TooltipProvider>");
    expect(updatedLayout).toContain("<PreferencesStoreProvider>");
    expect(updatedLayout).toContain("GlobalyzeLanguageSwitcher");
    expect(updatedLayout).toContain("<ThemeBootScript />");
  });

  it("skips runtime wiring when the detected entry is already wired", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-provider-wired-"));
    tempDirectories.push(rootDir);

    const layoutPath = path.join(rootDir, "src", "app", "layout.tsx");
    await mkdir(path.dirname(layoutPath), { recursive: true });
    await writeFile(
      path.join(rootDir, "package.json"),
      JSON.stringify({ dependencies: { next: "15.0.0", react: "19.0.0" } })
    );
    await writeFile(
      layoutPath,
      [
        'import { GlobalyzeLocaleProvider } from "../i18n/useLocale";',
        "",
        "export default function RootLayout({ children }: { children: React.ReactNode }) {",
        "  return (",
        "    <html>",
        "      <body>",
        "        <GlobalyzeLocaleProvider>{children}</GlobalyzeLocaleProvider>",
        "      </body>",
        "    </html>",
        "  );",
        "}",
        ""
      ].join("\n")
    );

    const originalLayout = await readFile(layoutPath, "utf8");
    const config = createTestConfig(rootDir, {
      i18nAdapter: "generic"
    });
    const result = await setupRuntimeProvider(
      config,
      { name: "pnpm", installCommand: "pnpm add" },
      { confirmWiring: true }
    );
    const updatedLayout = await readFile(layoutPath, "utf8");

    expect(result.alreadyWired).toBe(true);
    expect(result.wired).toBe(false);
    expect(updatedLayout).toBe(originalLayout);
  });

  it("falls back to runtime guidance when automatic provider wiring is not safe", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-guidance-"));
    tempDirectories.push(rootDir);

    const layoutPath = path.join(rootDir, "src", "app", "layout.tsx");
    await mkdir(path.dirname(layoutPath), { recursive: true });
    await writeFile(
      path.join(rootDir, "package.json"),
      JSON.stringify({ dependencies: { next: "15.0.0", react: "19.0.0" } })
    );
    await writeFile(
      layoutPath,
      [
        "export default function RootLayout({ children }: { children: React.ReactNode }) {",
        "  return <html><body>{children}</body></html>;",
        "}",
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir, {
      i18nAdapter: "react-i18next"
    });
    const result = await setupRuntimeProvider(
      config,
      { name: "npm", installCommand: "npm install" },
      { confirmWiring: true }
    );
    const guidance = await readFile(
      path.join(rootDir, "globalyze.runtime.md"),
      "utf8"
    );

    expect(result.wired).toBe(false);
    expect(result.guidancePath).toBe(path.join(rootDir, "globalyze.runtime.md"));
    expect(guidance).toContain("Run `npm install react-i18next`");
    expect(guidance).toContain("Add a language switcher");
  });

  it("injects a provider into a Next.js pages router app entry when safe", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-pages-router-"));
    tempDirectories.push(rootDir);

    const appPath = path.join(rootDir, "src", "pages", "_app.tsx");
    await mkdir(path.dirname(appPath), { recursive: true });
    await writeFile(
      path.join(rootDir, "package.json"),
      JSON.stringify({ dependencies: { next: "15.0.0", react: "19.0.0" } })
    );
    await writeFile(
      appPath,
      [
        "export default function App({ Component, pageProps }: { Component: React.ComponentType<any>; pageProps: Record<string, unknown> }) {",
        "  return <Component {...pageProps} />;",
        "}",
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir, {
      i18nAdapter: "generic"
    });
    const result = await setupRuntimeProvider(
      config,
      { name: "pnpm", installCommand: "pnpm add" },
      { confirmWiring: true }
    );
    const updatedApp = await readFile(appPath, "utf8");

    expect(result.wired).toBe(true);
    expect(updatedApp).toContain("GlobalyzeLocaleProvider");
    expect(updatedApp).toContain("GlobalyzeLanguageSwitcher");
  });

  it("injects a provider into a Remix root entry when safe", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-remix-wire-"));
    tempDirectories.push(rootDir);

    const rootPath = path.join(rootDir, "app", "root.tsx");
    await mkdir(path.dirname(rootPath), { recursive: true });
    await writeFile(
      path.join(rootDir, "package.json"),
      JSON.stringify({
        dependencies: { "@remix-run/react": "2.0.0", react: "19.0.0" }
      })
    );
    await writeFile(
      rootPath,
      [
        'import { Outlet } from "@remix-run/react";',
        "",
        "export default function Root() {",
        "  return <Outlet />;",
        "}",
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir, {
      i18nAdapter: "generic"
    });
    const result = await setupRuntimeProvider(
      config,
      { name: "bun", installCommand: "bun add" },
      { confirmWiring: true }
    );
    const updatedRoot = await readFile(rootPath, "utf8");

    expect(result.wired).toBe(true);
    expect(updatedRoot).toContain("GlobalyzeLocaleProvider");
    expect(updatedRoot).toContain("GlobalyzeLanguageSwitcher");
  });

  it("injects a provider into a TanStack Start root entry when safe", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-tanstack-wire-"));
    tempDirectories.push(rootDir);

    const rootPath = path.join(rootDir, "src", "app", "__root.tsx");
    await mkdir(path.dirname(rootPath), { recursive: true });
    await writeFile(
      path.join(rootDir, "package.json"),
      JSON.stringify({
        dependencies: { "@tanstack/start": "1.0.0", react: "19.0.0" }
      })
    );
    await writeFile(
      rootPath,
      [
        'import { Outlet } from "@tanstack/start";',
        "",
        "export default function Root() {",
        "  return <Outlet />;",
        "}",
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir, {
      i18nAdapter: "generic"
    });
    const result = await setupRuntimeProvider(
      config,
      { name: "bun", installCommand: "bun add" },
      { confirmWiring: true }
    );
    const updatedRoot = await readFile(rootPath, "utf8");

    expect(result.wired).toBe(true);
    expect(updatedRoot).toContain("GlobalyzeLocaleProvider");
    expect(updatedRoot).toContain("GlobalyzeLanguageSwitcher");
    expect(updatedRoot).toContain('import { getCurrentLocale } from "@/i18n";');
  });

  it("injects a provider into a React Router root entry when safe", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-react-router-wire-"));
    tempDirectories.push(rootDir);

    const rootPath = path.join(rootDir, "app", "root.tsx");
    await mkdir(path.dirname(rootPath), { recursive: true });
    await writeFile(
      path.join(rootDir, "package.json"),
      JSON.stringify({
        dependencies: {
          "@react-router/dev": "7.0.0",
          "react-router": "7.0.0",
          react: "19.0.0"
        }
      })
    );
    await writeFile(
      rootPath,
      [
        'import { Outlet } from "react-router";',
        "",
        "export default function Root() {",
        "  return <Outlet />;",
        "}",
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir, {
      i18nAdapter: "generic"
    });
    const result = await setupRuntimeProvider(
      config,
      { name: "bun", installCommand: "bun add" },
      { confirmWiring: true }
    );
    const updatedRoot = await readFile(rootPath, "utf8");

    expect(result.wired).toBe(true);
    expect(updatedRoot).toContain("GlobalyzeLocaleProvider");
    expect(updatedRoot).toContain("GlobalyzeLanguageSwitcher");
    expect(updatedRoot).toContain('import { getCurrentLocale } from "@/i18n";');
  });

  it("generates a generic locale hook with config-driven languages", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locale-hook-"));
    tempDirectories.push(rootDir);

    await mkdir(path.join(rootDir, "src", "app"), { recursive: true });
    await writeFile(
      path.join(rootDir, "package.json"),
      JSON.stringify({ dependencies: { next: "15.0.0", react: "19.0.0" } })
    );
    await writeFile(
      path.join(rootDir, "src", "app", "layout.tsx"),
      [
        "export default function RootLayout({ children }: { children: React.ReactNode }) {",
        "  return <html><body>{children}</body></html>;",
        "}",
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir, {
      i18nAdapter: "custom",
      languages: ["en", "fr", "ar"]
    });
    await setupRuntimeProvider(
      config,
      { name: "bun", installCommand: "bun add" },
      { confirmWiring: true }
    );

    const localeHook = await readFile(
      path.join(rootDir, "src", "i18n", "useLocale.tsx"),
      "utf8"
    );
    const switcher = await readFile(
      path.join(rootDir, "src", "components", "GlobalyzeLanguageSwitcher.tsx"),
      "utf8"
    );
    const labels = await readFile(
      path.join(rootDir, "src", "runtime", "languageLabels.ts"),
      "utf8"
    );

    expect(localeHook).toContain("GlobalyzeLocaleProvider");
    expect(localeHook).toContain("TODO: connect this provider state to your custom i18n runtime.");
    expect(localeHook).toContain('document.cookie = `${COOKIE_KEY}=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; SameSite=Lax`;');
    expect(localeHook).toContain("window.location.reload();");
    expect(switcher).toContain("resolveLanguageLabel");
    expect(labels).toContain('"fr"');
    expect(labels).toContain('"ar"');
  });

  it("generates runtime language artifacts as JSX and JS for JavaScript projects", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-locale-hook-js-"));
    tempDirectories.push(rootDir);

    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await writeFile(
      path.join(rootDir, "package.json"),
      JSON.stringify({ dependencies: { react: "19.0.0", vite: "6.0.0" } })
    );
    await writeFile(
      path.join(rootDir, "src", "main.jsx"),
      [
        'import { createRoot } from "react-dom/client";',
        'import App from "./App";',
        "",
        'createRoot(document.getElementById("root")).render(<App />);',
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir, {
      i18nAdapter: "generic",
      languages: ["en", "es"],
      localeStructure: {
        ...createTestConfig(rootDir).localeStructure,
        format: "json"
      }
    });
    await setupRuntimeProvider(
      config,
      { name: "bun", installCommand: "bun add" },
      { confirmWiring: true }
    );

    const localeHook = await readFile(
      path.join(rootDir, "src", "i18n", "useLocale.jsx"),
      "utf8"
    );
    const switcher = await readFile(
      path.join(rootDir, "src", "components", "GlobalyzeLanguageSwitcher.jsx"),
      "utf8"
    );
    const labels = await readFile(
      path.join(rootDir, "src", "runtime", "languageLabels.js"),
      "utf8"
    );

    expect(localeHook).toContain("<GlobalyzeLocaleContext.Provider");
    expect(localeHook).toContain('document.cookie = `${COOKIE_KEY}=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; SameSite=Lax`;');
    expect(localeHook).toContain("window.location.reload();");
    expect(localeHook).not.toContain("export interface");
    expect(switcher).toContain("export function GlobalyzeLanguageSwitcher");
    expect(switcher).not.toContain("GlobalyzeLanguageSwitcherProps");
    expect(labels).toContain("export const GLOBALYZE_LANGUAGES =");
    expect(labels).not.toContain("export type GlobalyzeLanguage");
  });
});
