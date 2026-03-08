import { Command } from "commander";
import { confirm, isCancel, select } from "@clack/prompts";

import { inferTranslationInstructions } from "../context/appContext";
import {
  createDefaultConfigContents,
  DEFAULT_LOCALE_STRUCTURE,
  normalizeLanguageCodes,
  pathExists,
  writeTextFile
} from "../utils/fileUtils";
import { GlobalyzeError } from "../utils/errors";
import { logger } from "../utils/logger";
import type { LocaleStructureConfig } from "../types";

export async function promptLocaleStructure(): Promise<LocaleStructureConfig> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return DEFAULT_LOCALE_STRUCTURE;
  }

  const format = await select({
    message: "Select locale file format",
    options: [
      { label: "JSON", value: "json" },
      { label: "JavaScript", value: "js" }
    ]
  });

  if (isCancel(format)) {
    throw new GlobalyzeError("Locale structure setup was cancelled.");
  }

  const structure = await select({
    message: "Select locale structure",
    options: [
      { label: "Single file", value: "single" },
      { label: "Multiple files", value: "multiple" }
    ]
  });

  if (isCancel(structure)) {
    throw new GlobalyzeError("Locale structure setup was cancelled.");
  }

  if (structure === "single") {
    return {
      format,
      structure,
      splitStrategy: "page",
      commonFile: false,
      naming: "dot"
    };
  }

  const splitStrategy = await select({
    message: "Split translations by",
    options: [
      { label: "Page", value: "page" },
      { label: "Component", value: "component" }
    ]
  });

  if (isCancel(splitStrategy)) {
    throw new GlobalyzeError("Locale structure setup was cancelled.");
  }

  const namingExample =
    splitStrategy === "component"
      ? {
          dot: "pricing.component.js",
          camel: "pricingComponent.js",
          snake: "pricing_component.js",
          kebab: "pricing-component.js"
        }
      : {
          dot: "pricing.page.js",
          camel: "pricingPage.js",
          snake: "pricing_page.js",
          kebab: "pricing-page.js"
        };

  const naming = await select({
    message: "Select locale file naming",
    options: [
      { label: `Dotted (${namingExample.dot})`, value: "dot" },
      { label: `camelCase (${namingExample.camel})`, value: "camel" },
      { label: `snake_case (${namingExample.snake})`, value: "snake" },
      { label: `kebab-case (${namingExample.kebab})`, value: "kebab" }
    ]
  });

  if (isCancel(naming)) {
    throw new GlobalyzeError("Locale structure setup was cancelled.");
  }

  const commonFile = await confirm({
    message: "Enable shared common translation file? (recommended)",
    initialValue: true
  });

  if (isCancel(commonFile)) {
    throw new GlobalyzeError("Locale structure setup was cancelled.");
  }

  return {
    format,
    structure,
    splitStrategy,
    commonFile,
    naming
  };
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create a globalyze.config.ts file in the current directory")
    .option("-f, --force", "Overwrite an existing config file")
    .option(
      "--langs <codes>",
      "Comma-separated language list to use instead of the defaults"
    )
    .action(async (options: { force?: boolean; langs?: string }) => {
      await executeInitCommand(options);
    });
}

export async function executeInitCommand(
  options: {
    force?: boolean;
    langs?: string;
    localeStructure?: LocaleStructureConfig;
  } = {}
): Promise<void> {
  const configPath = "globalyze.config.ts";

  if ((await pathExists(configPath)) && !options.force) {
    throw new GlobalyzeError(
      `Config already exists at ${configPath}. Re-run with --force to overwrite it.`
    );
  }

  const languages = options.langs
    ? normalizeLanguageCodes(options.langs.split(","))
    : undefined;
  const translationInstructions = await inferTranslationInstructions(process.cwd());
  const localeStructure = options.localeStructure ?? await promptLocaleStructure();

  await writeTextFile(
    configPath,
    createDefaultConfigContents(
      languages,
      translationInstructions,
      localeStructure
    )
  );
  logger.success(
    `created ${configPath}${
      languages ? ` with languages ${languages.join(", ")}` : ""
    }`
  );
  logger.info("Added editable translationInstructions based on the current app.");
}
