import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { executeInitCommand } from "../src/commands/init";
import { executeAddLanguagesCommand } from "../src/commands/languages";

describe("config commands", () => {
  const originalCwd = process.cwd();
  const tempDirectories: string[] = [];

  afterEach(async () => {
    process.chdir(originalCwd);
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
    delete process.env.LINGO_API_KEY;
  });

  it("initializes config with custom languages", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-init-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);

    await executeInitCommand({
      langs: "de,fr"
    });

    const contents = await readFile(
      path.join(rootDir, "globalyze.config.ts"),
      "utf8"
    );
    const languageSwitcher = await readFile(
      path.join(rootDir, "src", "components", "GlobalyzeLanguageSwitcher.tsx"),
      "utf8"
    );
    const localeHook = await readFile(
      path.join(rootDir, "src", "i18n", "useLocale.ts"),
      "utf8"
    );

    expect(contents).toContain('sourceDir: "src"');
    expect(contents).toContain('localesDir: "locales"');
    expect(contents).toContain('languages: ["en", "de", "fr"]');
    expect(contents).toContain(
      'ignore: ["node_modules", "dist", "build", ".next", ".git"],'
    );
    expect(contents).toContain("localeStructure:");
    expect(contents).toContain('format: "ts"');
    expect(contents).toContain('structure: "single"');
    expect(contents).toContain('naming: "dot"');
    expect(contents).toContain('unresolvedOwnership: "common"');
    expect(contents).toContain("translationInstructions:");
    expect(contents).toContain('sourceLocale: "en"');
    expect(contents).toContain('openAiModel: "gpt-4o-mini"');
    expect(contents).toContain('geminiModel: "gemini-2.5-flash-lite"');
    expect(contents).toContain("aiBatchSize: 20");
    expect(contents).toContain('translationImportPath: "@/i18n"');
    expect(contents).toContain('translationFunctionName: "t"');
    expect(languageSwitcher).toContain("GlobalyzeLanguageSwitcher");
    expect(localeHook).toContain("useLocale");
  });

  it("infers editable translation instructions from the current app", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-init-context-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);

    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await writeFile(
      path.join(rootDir, "src", "page.tsx"),
      [
        "export default function Page() {",
        '  return <button>Book appointment</button>;',
        "}",
        ""
      ].join("\n"),
      "utf8"
    );

    await executeInitCommand();

    const contents = await readFile(
      path.join(rootDir, "globalyze.config.ts"),
      "utf8"
    );

    expect(contents).toContain("translationInstructions:");
    expect(contents).toContain("scheduling");
    expect(contents).toContain("bookings");
  });

  it("adds languages from the CLI and creates translated locale files", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-languages-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);

    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await writeFile(
      path.join(rootDir, "src", "page.tsx"),
      [
        'import { t } from "@/i18n";',
        "export default function Page() {",
        '  return <button>{t("checkout.buy_button")}</button>;',
        "}",
        ""
      ].join("\n"),
      "utf8"
    );
    await executeInitCommand();
    await mkdir(path.join(rootDir, "locales"), { recursive: true });
    await mkdir(path.join(rootDir, "locales", "en"), { recursive: true });
    await writeFile(
      path.join(rootDir, "locales", "en", "en.ts"),
      'export const en = {\n  "checkout.buy_button": "Buy now"\n} as const;\n',
      "utf8"
    );

    await executeAddLanguagesCommand(["tr"]);

    const configContents = await readFile(
      path.join(rootDir, "globalyze.config.ts"),
      "utf8"
    );
    const turkishLocale = await readFile(
      path.join(rootDir, "locales", "tr", "tr.ts"),
      "utf8"
    );

    expect(configContents).toContain('languages: ["en", "tr"]');
    expect(turkishLocale).toContain('"checkout.buy_button": "Buy now"');
  });

  it("adds languages by transforming hardcoded UI when the project is not keyed yet", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-add-transform-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);

    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await writeFile(
      path.join(rootDir, "src", "page.tsx"),
      [
        "export default function Page() {",
        '  return <button>Buy now</button>;',
        "}",
        ""
      ].join("\n"),
      "utf8"
    );
    await executeInitCommand();

    await executeAddLanguagesCommand(["tr"]);

    const sourceContents = await readFile(
      path.join(rootDir, "src", "page.tsx"),
      "utf8"
    );
    const englishLocale = await readFile(
      path.join(rootDir, "locales", "en", "en.ts"),
      "utf8"
    );
    const turkishLocale = await readFile(
      path.join(rootDir, "locales", "tr", "tr.ts"),
      "utf8"
    );

    expect(sourceContents).toContain('import { t } from "@/i18n";');
    expect(sourceContents).toContain('{t("');
    expect(englishLocale).toContain('"Buy now"');
    expect(turkishLocale).toContain('"Buy now"');
  });
});
