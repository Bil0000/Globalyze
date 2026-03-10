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

    expect(await detectFramework(nextRoot)).toBe("next-app-router");
    expect(await detectFramework(viteRoot)).toBe("vite-react");
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
      path.join(rootDir, "src", "i18n", "useLocale.ts"),
      "utf8"
    );
    const languageLabels = await readFile(
      path.join(rootDir, "src", "runtime", "languageLabels.ts"),
      "utf8"
    );

    expect(result.wired).toBe(true);
    expect(updatedLayout).toContain('import { NextIntlClientProvider } from "next-intl";');
    expect(updatedLayout).toContain("<NextIntlClientProvider");
    expect(updatedLayout).toContain("GlobalyzeLanguageSwitcher");
    expect(languageSwitcher).toContain("export function GlobalyzeLanguageSwitcher");
    expect(localeHook).toContain('import { useLocale as useNextIntlLocale } from "next-intl";');
    expect(languageLabels).toContain("DEFAULT_LANGUAGE_LABELS");
    expect(result.devSwitcherInjected).toBe(true);
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
      path.join(rootDir, "src", "i18n", "useLocale.ts"),
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
    expect(switcher).toContain("resolveLanguageLabel");
    expect(labels).toContain('"fr"');
    expect(labels).toContain('"ar"');
  });
});
