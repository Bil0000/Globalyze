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

  it("replaces translatable object-property strings used in UI config", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-transform-"));
    tempDirectories.push(rootDir);

    const filePath = path.join(rootDir, "src", "app", "dashboard", "page.tsx");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        "const items = [",
        '  { title: "Dashboard", href: "/dashboard" },',
        '  { label: "Analytics", description: "Revenue trends" }',
        "];",
        "",
        "export default function Page() {",
        "  return <div>{items.length}</div>;",
        "}",
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir);
    const result = await transformFile(
      filePath,
      new Map([
        ["Dashboard", "dashboard.sidebar_title"],
        ["Analytics", "dashboard.tab_analytics"],
        ["Revenue trends", "dashboard.revenue_trends"]
      ]),
      config
    );
    const updatedSource = await Bun.file(filePath).text();

    expect(result.updated).toBe(true);
    expect(updatedSource).toContain('title: t("dashboard.sidebar_title")');
    expect(updatedSource).toContain('label: t("dashboard.tab_analytics")');
    expect(updatedSource).toContain('description: t("dashboard.revenue_trends")');
  });

  it("replaces data-driven table and chart config strings with translation calls", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-transform-"));
    tempDirectories.push(rootDir);

    const filePath = path.join(
      rootDir,
      "src",
      "app",
      "dashboard",
      "crm",
      "_components",
      "crm.config.ts"
    );
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        "const rows = [",
        '  { status: "Blocked", source: "Referral", reviewer: "Mona", owner: "Ops" },',
        '  { month: "January", header: "Revenue", nextAction: "Follow up" }',
        "];",
        "",
        "export default rows;",
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir);
    const result = await transformFile(
      filePath,
      new Map([
        ["Blocked", "crm.status_blocked"],
        ["Referral", "crm.source_referral"],
        ["Mona", "crm.reviewer_mona"],
        ["Ops", "crm.owner_ops"],
        ["January", "crm.month_january"],
        ["Revenue", "crm.header_revenue"],
        ["Follow up", "crm.next_action_follow_up"]
      ]),
      config
    );
    const updatedSource = await Bun.file(filePath).text();

    expect(result.updated).toBe(true);
    expect(updatedSource).toContain('status: t("crm.status_blocked")');
    expect(updatedSource).toContain('source: t("crm.source_referral")');
    expect(updatedSource).toContain('reviewer: t("crm.reviewer_mona")');
    expect(updatedSource).toContain('owner: t("crm.owner_ops")');
    expect(updatedSource).toContain('month: t("crm.month_january")');
    expect(updatedSource).toContain('header: t("crm.header_revenue")');
    expect(updatedSource).toContain('nextAction: t("crm.next_action_follow_up")');
  });

  it("does not rewrite json files into invalid JavaScript", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-transform-"));
    tempDirectories.push(rootDir);

    const filePath = path.join(
      rootDir,
      "src",
      "app",
      "dashboard",
      "default",
      "_components",
      "data.json"
    );
    await mkdir(path.dirname(filePath), { recursive: true });
    const originalSource = JSON.stringify(
      [
        {
          header: "Cover page",
          status: "Ready"
        }
      ],
      null,
      2
    );
    await writeFile(filePath, `${originalSource}\n`);

    const config = createTestConfig(rootDir);
    const result = await transformFile(
      filePath,
      new Map([
        ["Cover page", "default.data.cover_page"],
        ["Ready", "default.data.ready"]
      ]),
      config
    );
    const updatedSource = await Bun.file(filePath).text();

    expect(result.updated).toBe(false);
    expect(updatedSource).toBe(`${originalSource}\n`);
    expect(updatedSource).not.toContain('import { t } from "@/i18n";');
  });

  it("does not translate date formatting option literals", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-transform-"));
    tempDirectories.push(rootDir);

    const filePath = path.join(
      rootDir,
      "src",
      "app",
      "dashboard",
      "default",
      "_components",
      "chart-area-interactive.tsx"
    );
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        "export function Chart() {",
        "  return new Date().toLocaleDateString(\"en-US\", {",
        '    month: "short",',
        '    day: "numeric"',
        "  });",
        "}",
        ""
      ].join("\n")
    );

    const config = createTestConfig(rootDir);
    const result = await transformFile(
      filePath,
      new Map([["short", "default.chart.short"]]),
      config
    );
    const updatedSource = await Bun.file(filePath).text();

    expect(result.updated).toBe(false);
    expect(updatedSource).toContain('month: "short"');
    expect(updatedSource).not.toContain('month: t("default.chart.short")');
  });
});
