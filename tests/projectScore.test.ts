import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { generateProjectScore } from "../src/report/projectScore";
import { writeLocaleDictionary } from "../src/i18n/localeManager";
import { createTestConfig } from "./testUtils";

describe("generateProjectScore", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
  });

  it("scores projects using coverage, hardcoded strings, and unused keys", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-score-"));
    tempDirectories.push(rootDir);

    const filePath = path.join(rootDir, "src", "app", "page.tsx");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        'import { t } from "@/i18n";',
        'export default function Page() {',
        '  return <button>{t("checkout.buy_button")}</button>;',
        "}",
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir, {
      languages: ["en", "fr"]
    });

    await writeLocaleDictionary(config, "en", {
      "checkout.buy_button": "Buy now",
      "unused.key": "Unused"
    });
    await writeLocaleDictionary(config, "fr", {
      "checkout.buy_button": "Acheter",
      "unused.key": "Inutilisé"
    });

    const score = await generateProjectScore(config);

    expect(score.coverage).toBe(100);
    expect(score.unusedLocaleKeys).toBe(1);
    expect(score.hardcodedStrings).toBe(0);
    expect(score.grade).toBe("A");
  });
});
