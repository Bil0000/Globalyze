import path from "node:path";
import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  analyzeExtractableStringsFromFiles,
  extractStringsFromSource
} from "../src/extractor/stringExtractor";

describe("extractStringsFromSource", () => {
  it("extracts sidebar and tab labels from UI config objects", () => {
    const source = [
      "const sidebarItems = [",
      '  { title: "Dashboard", href: "/dashboard" },',
      '  { label: "Analytics", value: "analytics" }',
      "];",
      ""
    ].join("\n");

    const extracted = extractStringsFromSource(
      source,
      "/tmp/demo/src/app/dashboard/page.tsx"
    );

    expect(extracted.map((entry) => entry.text)).toEqual([
      "Dashboard",
      "Analytics"
    ]);
    expect(extracted.map((entry) => entry.kind)).toEqual([
      "object-property",
      "object-property"
    ]);
    expect(extracted.map((entry) => entry.propertyName)).toEqual([
      "title",
      "label"
    ]);
  });

  it("extracts field descriptions and hints from object properties", () => {
    const source = [
      "const fields = [",
      '  { name: "email", label: "Email", description: "Work email", hint: "We never share it" }',
      "];",
      ""
    ].join("\n");

    const extracted = extractStringsFromSource(
      source,
      "/tmp/demo/src/components/ProfileForm.tsx"
    );

    expect(extracted.map((entry) => entry.text)).toEqual([
      "Email",
      "Work email",
      "We never share it"
    ]);
  });

  it("extracts table and chart strings from data-driven config fields", () => {
    const source = [
      "const rows = [",
      '  { status: "Blocked", source: "Referral", reviewer: "Sarah", owner: "Ops", nextAction: "Escalate", priority: "High" },',
      '  { month: "January", header: "Revenue", stage: "Negotiation", blocker: "Legal" }',
      "];",
      ""
    ].join("\n");

    const extracted = extractStringsFromSource(
      source,
      "/tmp/demo/src/app/dashboard/crm/_components/crm.config.ts"
    );

    expect(extracted.map((entry) => entry.text)).toEqual([
      "Blocked",
      "Referral",
      "Sarah",
      "Ops",
      "Escalate",
      "High",
      "January",
      "Revenue",
      "Negotiation",
      "Legal"
    ]);
  });

  it("does not extract date formatting option literals as UI strings", () => {
    const source = [
      "const formatted = new Date().toLocaleDateString(\"en-US\", {",
      '  month: "short",',
      '  day: "numeric"',
      "});",
      ""
    ].join("\n");

    const extracted = extractStringsFromSource(
      source,
      "/tmp/demo/src/app/dashboard/default/_components/chart-area-interactive.tsx"
    );

    expect(extracted.map((entry) => entry.text)).toEqual([]);
  });

  it("extracts translatable values from json data files", () => {
    const source = JSON.stringify(
      [
        {
          header: "Status",
          type: "Internal",
          status: "Approved",
          reviewer: "Mona"
        }
      ],
      null,
      2
    );

    const extracted = extractStringsFromSource(
      source,
      "/tmp/demo/src/app/dashboard/default/_components/data.json"
    );

    expect(extracted.map((entry) => entry.text)).toEqual([
      "Status",
      "Internal",
      "Approved",
      "Mona"
    ]);
    expect(extracted.every((entry) => entry.kind === "object-property")).toBe(true);
  });

  it("skips json files that already have a generated Globalyze sidecar", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-extract-"));

    try {
      const jsonPath = path.join(
        rootDir,
        "src",
        "app",
        "dashboard",
        "default",
        "_components",
        "data.json"
      );
      const sidecarPath = jsonPath.replace(/\.json$/, ".globalyze.ts");
      await mkdir(path.dirname(jsonPath), { recursive: true });
      await writeFile(
        jsonPath,
        `${JSON.stringify([{ header: "Cover page", status: "Done" }], null, 2)}\n`
      );
      await writeFile(
        sidecarPath,
        'import { t } from "@/i18n";\nexport default [{ header: t("default.data.cover_page") }];\n'
      );

      const analysis = await analyzeExtractableStringsFromFiles([jsonPath], {
        projectRoot: rootDir
      });

      expect(analysis.strings).toEqual([]);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
