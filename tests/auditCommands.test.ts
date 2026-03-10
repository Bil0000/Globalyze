import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { executeAuditCommand } from "../src/commands/audit";
import { createTestConfig } from "./testUtils";

describe("audit command", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
  });

  it("reports remaining JSX and object-property UI strings", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-audit-"));
    tempDirectories.push(rootDir);

    const filePath = path.join(rootDir, "src", "app", "dashboard", "page.tsx");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        "const items = [",
        '  { title: "Dashboard", href: "/dashboard" },',
        "];",
        "",
        "export default function Page() {",
        '  return <button title="Save changes">Save</button>;',
        "}",
        ""
      ].join("\n")
    );

    const result = await executeAuditCommand({
      config: path.join(rootDir, "globalyze.config.ts"),
      sourceDir: path.join(rootDir, "src"),
      localesDir: path.join(rootDir, "locales")
    }).catch(async () => {
      const config = createTestConfig(rootDir);
      await writeFile(
        path.join(rootDir, "globalyze.config.ts"),
        `export default ${JSON.stringify({
          sourceDir: "src",
          localesDir: "locales",
          languages: ["en"],
          localeStructure: config.localeStructure,
          cacheTranslations: true,
          dynamicExtraction: true,
          i18nAdapter: "generic",
          sourceLocale: "en",
          openAiModel: "gpt-4o-mini",
          geminiModel: "gemini-2.5-flash-lite",
          aiBatchSize: 20,
          translationImportPath: "@/i18n",
          translationFunctionName: "t",
          governance: {
            enabled: false,
            failOnLockedChange: true,
            failOnApprovalRequiredChange: false
          }
        }, null, 2)};\n`
      );

      return executeAuditCommand({
        config: path.join(rootDir, "globalyze.config.ts")
      });
    });

    expect(result.summary.totalFindings).toBe(3);
    expect(result.summary.kindCounts["object-property"]).toBe(1);
    expect(result.summary.kindCounts["jsx-attribute"]).toBe(1);
    expect(result.summary.kindCounts["jsx-text"]).toBe(1);
  });
});
