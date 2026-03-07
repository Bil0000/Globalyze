import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { generateTransformPreview } from "../src/preview/transformPreview";
import { createTestConfig } from "./testUtils";

describe("generateTransformPreview", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
  });

  it("renders a diff without modifying source files", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-preview-"));
    tempDirectories.push(rootDir);

    const filePath = path.join(rootDir, "src", "app", "page.tsx");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      "export default function Page() { return <button>Buy now</button>; }\n"
    );

    const preview = await generateTransformPreview(createTestConfig(rootDir));
    const sourceAfterPreview = await Bun.file(filePath).text();

    expect(preview.files).toHaveLength(1);
    expect(preview.files[0]?.after).toContain('t("common.buy_now")');
    expect(preview.files[0]?.diff).toContain("--- src/app/page.tsx");
    expect(sourceAfterPreview).toContain("<button>Buy now</button>");
  });
});
