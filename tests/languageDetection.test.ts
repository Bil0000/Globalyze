import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { detectProjectLanguages } from "../src/config/languageDetection";

describe("detectProjectLanguages", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  it("detects languages from locale folders and next config", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-lang-detect-"));
    tempDirectories.push(rootDir);
    await mkdir(path.join(rootDir, "locales", "fr"), { recursive: true });
    await mkdir(path.join(rootDir, "locales", "es"), { recursive: true });
    await writeFile(
      path.join(rootDir, "next.config.js"),
      "export default { i18n: { locales: ['en', 'fr', 'es'] } };",
      "utf8"
    );

    const detected = await detectProjectLanguages(rootDir);

    expect(detected.languages).toEqual(["es", "fr", "en"]);
  });
});
