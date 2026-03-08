import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { executeCleanCommand } from "../src/commands/clean";
import { executeDuplicatesCommand } from "../src/commands/duplicates";
import { executeInitCommand } from "../src/commands/init";
import { executeRenameCommand } from "../src/commands/rename";
import { syncLocaleFiles } from "../src/i18n/localeManager";
import { writeTextFile } from "../src/utils/fileUtils";
import { createTestConfig } from "./testUtils";

describe("maintenance commands", () => {
  const tempDirectories: string[] = [];
  const originalCwd = process.cwd();

  afterEach(async () => {
    process.chdir(originalCwd);
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  it("detects duplicate source texts", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-maint-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await executeInitCommand();
    await syncLocaleFiles(createTestConfig(rootDir), {
      "checkout.pay_button": "Pay now",
      "checkout.pay_now": "Pay now"
    });

    const duplicates = await executeDuplicatesCommand();
    expect(duplicates[0]?.keys.length).toBe(2);
  });

  it("removes unused locale keys with --fix", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-maint-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await executeInitCommand();
    await writeTextFile(
      path.join(rootDir, "src", "page.tsx"),
      [
        'import { t } from "@/i18n";',
        'export default function Page() { return <button>{t("checkout.pay_button")}</button>; }',
        ""
      ].join("\n")
    );
    await syncLocaleFiles(createTestConfig(rootDir), {
      "checkout.pay_button": "Pay now",
      "unused.key": "Unused"
    });

    const result = await executeCleanCommand({ fix: true });
    expect(result.en).toContain("unused.key");
  });

  it("renames keys across source and locales", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-maint-"));
    tempDirectories.push(rootDir);
    process.chdir(rootDir);
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await executeInitCommand();
    await writeTextFile(
      path.join(rootDir, "src", "page.tsx"),
      [
        'import { t } from "@/i18n";',
        'export default function Page() { return <button>{t("checkout.pay_button")}</button>; }',
        ""
      ].join("\n")
    );
    await syncLocaleFiles(createTestConfig(rootDir), {
      "checkout.pay_button": "Pay now"
    });

    await executeRenameCommand("checkout.pay_button", "checkout.pay_now");

    const fileContents = await readFile(path.join(rootDir, "src", "page.tsx"), "utf8");
    expect(fileContents).toContain('t("checkout.pay_now")');
  });
});
