import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

import { scanProjectFiles } from "../src/scanner/projectScanner";
import { createTestConfig } from "./testUtils";

describe("scanProjectFiles", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
  });

  it("discovers supported source files and respects ignored directories", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-scan-"));
    tempDirectories.push(rootDir);

    await mkdir(path.join(rootDir, "src", "components"), { recursive: true });
    await mkdir(path.join(rootDir, "src", "dist"), { recursive: true });

    await writeFile(
      path.join(rootDir, "src", "components", "Hero.tsx"),
      "export function Hero() { return <h1>Welcome</h1>; }\n"
    );
    await writeFile(
      path.join(rootDir, "src", "components", "Button.jsx"),
      "export const Button = () => <button>Buy now</button>;\n"
    );
    await writeFile(
      path.join(rootDir, "src", "dist", "ignored.tsx"),
      "export const Ignored = () => <p>Ignored</p>;\n"
    );
    await writeFile(path.join(rootDir, "src", "notes.md"), "# ignored\n");

    const config = createTestConfig(rootDir);
    const files = await scanProjectFiles(config);

    expect(files.map((filePath) => path.basename(filePath)).sort()).toEqual([
      "Button.jsx",
      "Hero.tsx"
    ]);
  });
});
