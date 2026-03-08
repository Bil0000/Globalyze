import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { executeDoctorCommand } from "../src/commands/doctor";
import { buildVisualGraph, executeGraphCommand } from "../src/commands/graph";
import { executeInspectCommand } from "../src/commands/inspect";
import { executeLocalesCommand } from "../src/commands/locales";
import { executeSearchCommand } from "../src/commands/search";
import { executeWhereCommand } from "../src/commands/where";
import { extractTranslationKeyReferencesFromFiles } from "../src/extractor/translationKeyExtractor";
import { readTranslationGraph, updateTranslationGraph } from "../src/graph/translationGraph";
import { writeLocaleEntries } from "../src/i18n/localeManager";
import { scanProjectFiles } from "../src/scanner/projectScanner";
import type { LocaleStructureConfig } from "../src/types";
import { createConfigContents, resolveGlobalyzeRootDir } from "../src/utils/fileUtils";
import { createTestConfig } from "./testUtils";

async function setupInspectionProject(
  localeStructure: LocaleStructureConfig
) {
  const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-inspect-"));
  const config = createTestConfig(rootDir, {
    languages: ["en", "fr"],
    localeStructure
  });
  const configPath = path.join(rootDir, "globalyze.config.ts");

  await mkdir(path.join(rootDir, "src", "app", "checkout"), {
    recursive: true
  });
  await mkdir(path.join(rootDir, "src", "components"), {
    recursive: true
  });
  await writeFile(configPath, createConfigContents(config), "utf8");
  await writeFile(
    path.join(rootDir, "src", "app", "checkout", "page.tsx"),
    [
      'import { t } from "@/i18n";',
      "export default function CheckoutPage() {",
      "  return (",
      "    <section>",
      '      <button>{t("checkout.pay_button")}</button>',
      '      <button>{t("checkout.cancel")}</button>',
      "    </section>",
      "  );",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(rootDir, "src", "components", "CheckoutButton.tsx"),
    [
      'import { t } from "@/i18n";',
      "export function CheckoutButton() {",
      '  return <button>{t("checkout.pay_button")}</button>;',
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(rootDir, "src", "components", "MobileCheckout.tsx"),
    [
      'import { t } from "@/i18n";',
      "export function MobileCheckout() {",
      "  return (",
      "    <section>",
      '      <button>{t("checkout.pay_button")}</button>',
      '      <button>{t("checkout.mobile_pay")}</button>',
      "    </section>",
      "  );",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );

  await writeLocaleEntries(config, "en", {
    "checkout.pay_button": {
      value: "Pay now",
      owner: "payments-team",
      locked: false,
      approvalRequired: false
    },
    "checkout.mobile_pay": {
      value: "Pay now"
    },
    "checkout.cancel": {
      value: "Cancel",
      approvalRequired: true
    },
    "checkout.unused": {
      value: "Unused"
    }
  });
  await writeLocaleEntries(config, "fr", {
    "checkout.pay_button": {
      value: "Payer"
    },
    "checkout.mobile_pay": {
      value: ""
    },
    "checkout.cancel": {
      value: ""
    },
    "checkout.unused": {
      value: "Inutilisé"
    }
  });

  await updateTranslationGraph(config, [
    {
      key: "checkout.pay_button",
      file: path.join(rootDir, "src", "app", "checkout", "page.tsx")
    },
    {
      key: "checkout.pay_button",
      file: path.join(rootDir, "src", "components", "CheckoutButton.tsx")
    },
    {
      key: "checkout.pay_button",
      file: path.join(rootDir, "src", "components", "MobileCheckout.tsx")
    },
    {
      key: "checkout.mobile_pay",
      file: path.join(rootDir, "src", "app", "checkout", "page.tsx")
    },
    {
      key: "checkout.mobile_pay",
      file: path.join(rootDir, "src", "components", "MobileCheckout.tsx")
    },
    {
      key: "checkout.cancel",
      file: path.join(rootDir, "src", "app", "checkout", "page.tsx")
    }
  ]);

  return {
    rootDir,
    config,
    configPath
  };
}

describe("inspection commands", () => {
  const tempDirectories: string[] = [];
  const graphPath = path.join(
    resolveGlobalyzeRootDir(),
    ".globalyze",
    "translationGraph.json"
  );
  let originalGraphContents: string | null = null;

  beforeEach(async () => {
    try {
      originalGraphContents = await readFile(graphPath, "utf8");
    } catch {
      originalGraphContents = null;
    }
  });

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;

    if (originalGraphContents === null) {
      await rm(graphPath, { force: true });
      return;
    }

    await writeFile(graphPath, originalGraphContents, "utf8");
  });

  it("inspects keys, graph summary, usages, search, and doctor output", async () => {
    const { rootDir, configPath } = await setupInspectionProject({
      format: "json",
      structure: "single",
      splitStrategy: "page",
      commonFile: false,
      naming: "dot"
    });
    tempDirectories.push(rootDir);

    const inspected = await executeInspectCommand("checkout.pay_button", {
      config: configPath
    });
    const graph = await executeGraphCommand({
      config: configPath,
      page: "checkout"
    });
    const componentGraph = await executeGraphCommand({
      config: configPath,
      component: "checkoutButton"
    });
    const usages = await executeWhereCommand("checkout.pay_button");
    const matches = await executeSearchCommand("Pay now", {
      config: configPath
    });
    const doctor = await executeDoctorCommand({
      config: configPath
    });

    expect(inspected.value).toBe("Pay now");
    expect(inspected.owner).toBe("payments-team");
    expect(inspected.localeFile).toBe("locales/en/en.json");
    expect(inspected.usages).toContain("src/components/CheckoutButton.tsx");
    expect(graph.totalKeys).toBe(3);
    expect(graph.totalPages).toBeGreaterThanOrEqual(1);
    expect(graph.matchingKeys).toEqual([
      "checkout.cancel",
      "checkout.mobile_pay",
      "checkout.pay_button"
    ]);
    expect(componentGraph.matchingKeys).toEqual(["checkout.pay_button"]);
    expect(usages).toContain("src/components/MobileCheckout.tsx");
    expect(matches.map((match) => match.key)).toEqual([
      "checkout.mobile_pay",
      "checkout.pay_button"
    ]);
    expect(doctor.totalKeys).toBe(4);
    expect(doctor.unusedKeys).toBe(1);
    expect(doctor.duplicateStrings).toBe(1);
    expect(doctor.coverage).toBe(50);
    expect(doctor.localeStructureLabel).toBe("single JSON");

    const visualLines = buildVisualGraph(await readTranslationGraph(), {
      page: "checkout"
    });

    expect(visualLines).toEqual([
      "checkout.page",
      "├ checkout.cancel",
      "├ checkout.mobile_pay",
      "└ checkout.pay_button"
    ]);
  });

  it("reads locales for single and multiple structures in JSON and JS formats", async () => {
    const structures: LocaleStructureConfig[] = [
      {
        format: "json",
        structure: "single",
        splitStrategy: "page",
        commonFile: false,
        naming: "dot"
      },
      {
        format: "json",
        structure: "multiple",
        splitStrategy: "page",
        commonFile: false,
        naming: "dot"
      },
      {
        format: "js",
        structure: "single",
        splitStrategy: "page",
        commonFile: false,
        naming: "dot"
      },
      {
        format: "js",
        structure: "multiple",
        splitStrategy: "page",
        commonFile: false,
        naming: "dot"
      }
    ];

    for (const structure of structures) {
      const { rootDir, configPath } = await setupInspectionProject(structure);
      tempDirectories.push(rootDir);

      const files = await executeLocalesCommand("en", undefined, {
        config: configPath
      });
      const scoped = await executeLocalesCommand("en", "checkout", {
        config: configPath
      });

      expect(files.length).toBeGreaterThan(0);
      expect(
        files.some((file) => Object.hasOwn(file.entries, "checkout.pay_button"))
      ).toBe(true);
      expect(scoped.length).toBeGreaterThan(0);
      expect(
        scoped.every((file) =>
          Object.keys(file.entries).every((key) => key.startsWith("checkout."))
        )
      ).toBe(true);
    }
  });

  it("persists governance metadata in the translation graph", async () => {
    const { rootDir } = await setupInspectionProject({
      format: "js",
      structure: "multiple",
      splitStrategy: "page",
      commonFile: false,
      naming: "dot"
    });
    tempDirectories.push(rootDir);

    const graph = await readTranslationGraph();

    expect(graph["checkout.pay_button"]?.owner).toBe("payments-team");
    expect(graph["checkout.pay_button"]?.locked).toBe(false);
    expect(graph["checkout.cancel"]?.approvalRequired).toBe(true);
  });

  it("tracks parent page ownership for keys used inside imported components", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-inspect-page-owner-"));
    tempDirectories.push(rootDir);
    const config = createTestConfig(rootDir, {
      languages: ["en"],
      localeStructure: {
        format: "js",
        structure: "multiple",
        splitStrategy: "page",
        commonFile: false,
        naming: "camel"
      }
    });
    const configPath = path.join(rootDir, "globalyze.config.ts");

    await mkdir(path.join(rootDir, "src", "app"), { recursive: true });
    await mkdir(path.join(rootDir, "src", "components"), { recursive: true });
    await writeFile(configPath, createConfigContents(config), "utf8");
    await writeFile(
      path.join(rootDir, "src", "app", "page.tsx"),
      [
        'import { MarketingHero } from "@/components/MarketingHero";',
        "export default function Page() {",
        "  return <MarketingHero />;",
        "}",
        ""
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      path.join(rootDir, "src", "components", "MarketingHero.tsx"),
      [
        'import { t } from "@/i18n";',
        "export function MarketingHero() {",
        '  return <h1>{t("home.hero_title")}</h1>;',
        "}",
        ""
      ].join("\n"),
      "utf8"
    );
    await writeLocaleEntries(config, "en", {
      "home.hero_title": {
        value: "Grow faster"
      }
    });

    const files = await scanProjectFiles(config);
    const references = await extractTranslationKeyReferencesFromFiles(
      files,
      config.translationFunctionName
    );
    await updateTranslationGraph(config, references);

    const graph = await readTranslationGraph();
    const visual = buildVisualGraph(graph, {
      page: "home"
    });
    const inspected = await executeInspectCommand("home.hero_title", {
      config: configPath
    });

    expect(graph["home.hero_title"]?.pageName).toBe("home");
    expect(graph["home.hero_title"]?.componentName).toBe("marketingHero");
    expect(graph["home.hero_title"]?.localeFile).toBe("homePage.js");
    expect(visual).toEqual(["home.page", "└ home.hero_title"]);
    expect(inspected.localeFile).toBe("locales/en/homePage.js");
  });
});
