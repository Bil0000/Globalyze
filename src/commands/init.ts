import { Command } from "commander";
import { confirm, isCancel, select, text } from "@clack/prompts";

import { detectProjectLanguages } from "../config/languageDetection";
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
    dynamicExtraction?: boolean;
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
    : await resolveInitialLanguages();
  const translationInstructions = await inferTranslationInstructions(process.cwd());
  const localeStructure = options.localeStructure ?? await promptLocaleStructure();
  const dynamicExtraction =
    options.dynamicExtraction ?? (await promptDynamicExtraction());

  await writeTextFile(
    configPath,
    createDefaultConfigContents(
      languages,
      translationInstructions,
      localeStructure,
      dynamicExtraction
    )
  );
  logger.success(
    `created ${configPath}${
      languages ? ` with languages ${languages.join(", ")}` : ""
    }`
  );
  logger.info("Added editable translationInstructions based on the current app.");
}

async function promptDynamicExtraction(): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const enabled = await confirm({
    message: "Enable dynamic extraction? (mixed JSX)",
    initialValue: false
  });

  if (isCancel(enabled)) {
    throw new GlobalyzeError("Dynamic extraction setup was cancelled.");
  }

  return enabled;
}

async function resolveInitialLanguages(): Promise<string[] | undefined> {
  const detected = await detectProjectLanguages(process.cwd());

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return detected.languages;
  }

  if (
    detected.languages.length === 1 &&
    detected.languages[0] === "en"
  ) {
    const extraLanguages = await text({
      message:
        'Only "en" was detected. Add more languages now (comma separated), or leave blank to continue with en only'
    });

    if (isCancel(extraLanguages)) {
      throw new GlobalyzeError("Language detection setup was cancelled.");
    }

    const trimmed = extraLanguages.trim();
    return trimmed.length > 0
      ? normalizeLanguageCodes(trimmed.split(","))
      : ["en"];
  }

  if (detected.languages.length <= 1) {
    return detected.languages;
  }

  const confirmed = await confirm({
    message: `Detected project languages: ${detected.languages.join(", ")}. Use these languages?`,
    initialValue: true
  });

  if (isCancel(confirmed)) {
    throw new GlobalyzeError("Language detection setup was cancelled.");
  }

  return confirmed ? detected.languages : ["en"];
}
