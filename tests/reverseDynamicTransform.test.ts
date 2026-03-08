import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { reverseDynamicTransformFile } from "../src/dynamic/reverseDynamicTransform";
import { writeLocaleDictionary } from "../src/i18n/localeManager";
import { writeTextFile } from "../src/utils/fileUtils";
import { createTestConfig } from "./testUtils";

describe("reverseDynamicTransform", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  it("rebuilds interpolated JSX from translation calls", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-dynamic-reverse-"));
    tempDirectories.push(rootDir);
    const config = createTestConfig(rootDir);
    const filePath = path.join(rootDir, "src", "app", "page.tsx");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeTextFile(
      filePath,
      [
        'import { t } from "@/i18n";',
        "export default function Page({ user, itemCount }) {",
        '  return <h1>{t("activity.items_added", { name: user.name, itemCount })}</h1>;',
        "}",
        ""
      ].join("\n")
    );
    await writeLocaleDictionary(config, "en", {
      "activity.items_added": "{name} added {itemCount} items"
    });

    await reverseDynamicTransformFile(filePath, config);

    const output = await readFile(filePath, "utf8");
    expect(output).toContain('user.name + " added " + itemCount + " items"');
  });
});
