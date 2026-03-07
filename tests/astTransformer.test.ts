import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { transformFile } from "../src/transformer/astTransformer";
import { createTestConfig } from "./testUtils";

describe("transformFile", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
  });

  it("replaces JSX text with translation calls and injects the i18n import", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-transform-"));
    tempDirectories.push(rootDir);

    const filePath = path.join(rootDir, "src", "app", "page.tsx");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        "export default function Page() {",
        "  return <button>Buy now</button>;",
        "}",
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir);
    const result = await transformFile(
      filePath,
      new Map([["Buy now", "checkout.buy_button"]]),
      config
    );
    const updatedSource = await Bun.file(filePath).text();

    expect(result.updated).toBe(true);
    expect(updatedSource).toContain('import { t } from "@/i18n";');
    expect(updatedSource).toContain('<button>{t("checkout.buy_button")}</button>');
  });
});
