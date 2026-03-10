import path from "node:path";
import fs from "fs-extra";

import { Command } from "commander";
import { confirm, isCancel, select, text } from "@clack/prompts";

import { detectProjectLanguages } from "../config/languageDetection";
import { inferTranslationInstructions } from "../context/appContext";
import {
  inspectRuntimeProviderTarget,
  setupRuntimeProvider
} from "../runtime/providerWiring";
import {
  createDefaultConfigContents,
  DEFAULT_LOCALE_STRUCTURE,
  loadGlobalyzeConfig,
  normalizeLanguageCodes,
  pathExists,
  writeTextFile
} from "../utils/fileUtils";
import {
  buildPackageInstallInvocation,
  detectPackageManager,
  installPackages
} from "../utils/packageManager";
import { GlobalyzeError } from "../utils/errors";
import { logger } from "../utils/logger";
import type {
  BuiltInI18nAdapter,
  DetectedPackageManager,
  LocaleStructureConfig,
  LocaleFileFormat,
  TranslationGovernanceConfig
} from "../types";

export async function promptLocaleStructure(): Promise<LocaleStructureConfig> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return DEFAULT_LOCALE_STRUCTURE;
  }

  const formatSelection = await select({
    message: "Select locale file format",
    initialValue: "ts",
    options: [
      { label: "TypeScript (.ts) (recommended)", value: "ts", hint: "typed const exports" },
      { label: "JavaScript (.js)", value: "js", hint: "plain runtime files" },
      { label: "JSON", value: "json" }
    ]
  });

  if (isCancel(formatSelection)) {
    throw new GlobalyzeError("Locale structure setup was cancelled.");
  }
  const format = formatSelection as LocaleFileFormat;

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
      naming: "dot",
      unresolvedOwnership: "common"
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

  const extension = format === "json" ? "json" : format;
  const namingExample =
    splitStrategy === "component"
      ? {
          dot: `pricing.component.${extension}`,
          camel: `pricingComponent.${extension}`,
          snake: `pricing_component.${extension}`,
          kebab: `pricing-component.${extension}`
        }
      : {
          dot: `pricing.page.${extension}`,
          camel: `pricingPage.${extension}`,
          snake: `pricing_page.${extension}`,
          kebab: `pricing-page.${extension}`
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
    naming,
    unresolvedOwnership: "common"
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
    i18nAdapter?: BuiltInI18nAdapter;
    governance?: TranslationGovernanceConfig;
    installAdapterDependency?: boolean;
    packageManager?: DetectedPackageManager["name"];
    wireRuntime?: boolean;
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
  const i18nAdapter = options.i18nAdapter ?? (await promptI18nAdapter());
  const localeStructure = options.localeStructure ?? await promptLocaleStructure();
  const dynamicExtraction =
    options.dynamicExtraction ?? (await promptDynamicExtraction());
  const governance = options.governance ?? (await promptGovernance());
  const detectedPackageManager = await detectPackageManager(process.cwd());
  const packageManager =
    options.packageManager && options.packageManager !== detectedPackageManager.name
      ? {
          name: options.packageManager,
          installCommand:
            options.packageManager === "bun"
              ? "bun add"
              : options.packageManager === "pnpm"
                ? "pnpm add"
                : options.packageManager === "yarn"
                  ? "yarn add"
                  : "npm install"
        }
      : detectedPackageManager;

  await writeTextFile(
    configPath,
    createDefaultConfigContents(
      languages,
      translationInstructions,
      localeStructure,
      dynamicExtraction,
      i18nAdapter,
      governance
    )
  );
  logger.success(
    `created ${configPath}${
      languages ? ` with languages ${languages.join(", ")}` : ""
    }`
  );
  logger.info("Added editable translationInstructions based on the current app.");
  await maybeInstallAdapterDependency(
    getAdapterDependencyPackages(i18nAdapter),
    packageManager,
    options.installAdapterDependency
  );

  await fs.ensureDir(path.join(process.cwd(), "src"));
  const config = await loadGlobalyzeConfig(configPath);
  await maybeSetupRuntimeProvider(config, packageManager, options.wireRuntime);
}

function getAdapterDependencyPackages(
  adapter: BuiltInI18nAdapter
): string[] {
  if (adapter === "react-i18next") {
    return ["react-i18next"];
  }

  if (adapter === "next-intl") {
    return ["next-intl"];
  }

  if (adapter === "react-intl") {
    return ["react-intl"];
  }

  return [];
}

async function maybeInstallAdapterDependency(
  packages: readonly string[],
  detectedPackageManager: DetectedPackageManager,
  installAdapterDependency?: boolean
): Promise<void> {
  if (packages.length === 0) {
    return;
  }

  logger.info(`Selected adapter dependency: ${packages.join(", ")}`);
  logger.info(`Detected package manager: ${detectedPackageManager.name}`);

  let selectedPackageManager = detectedPackageManager;
  let shouldInstall = installAdapterDependency;

  if (
    shouldInstall === undefined &&
    process.stdin.isTTY &&
    process.stdout.isTTY
  ) {
    const decision = await select({
      message: `Install adapter dependency?\n\n${buildPackageInstallInvocation(detectedPackageManager, packages).displayCommand}`,
      initialValue: "yes",
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
        { label: "Change package manager", value: "change" }
      ]
    });

    if (isCancel(decision)) {
      throw new GlobalyzeError("Adapter installation setup was cancelled.");
    }

    if (decision === "change") {
      const packageManagerName = await select({
        message: "Choose package manager",
        initialValue: detectedPackageManager.name,
        options: [
          { label: "pnpm", value: "pnpm" },
          { label: "npm", value: "npm" },
          { label: "yarn", value: "yarn" },
          { label: "bun", value: "bun" }
        ]
      });

      if (isCancel(packageManagerName)) {
        throw new GlobalyzeError("Adapter installation setup was cancelled.");
      }

      selectedPackageManager = {
        name: packageManagerName,
        installCommand:
          packageManagerName === "bun"
            ? "bun add"
            : packageManagerName === "pnpm"
              ? "pnpm add"
              : packageManagerName === "yarn"
                ? "yarn add"
                : "npm install"
      };
      shouldInstall = true;
    } else {
      shouldInstall = decision === "yes";
    }
  }

  const invocation = buildPackageInstallInvocation(
    selectedPackageManager,
    packages
  );

  if (shouldInstall) {
    await logger.step(
      "Installing adapter dependency",
      () => installPackages(selectedPackageManager, packages, process.cwd()),
      () => `Installed ${packages.join(", ")}`
    );
    return;
  }

  logger.info(`Run \`${invocation.displayCommand}\` manually when ready.`);
}

async function maybeSetupRuntimeProvider(
  config: Awaited<ReturnType<typeof loadGlobalyzeConfig>>,
  packageManager: DetectedPackageManager,
  wireRuntime?: boolean
): Promise<void> {
  let shouldWire = wireRuntime;

  if (
    shouldWire === undefined &&
    (!process.stdin.isTTY || !process.stdout.isTTY)
  ) {
    shouldWire = false;
  }

  if (
    shouldWire === undefined &&
    process.stdin.isTTY &&
    process.stdout.isTTY
  ) {
    const preview = await inspectRuntimeProviderTarget(config);

    if (preview.alreadyWired) {
      logger.info(preview.skippedReason ?? "Runtime provider is already wired.");
      shouldWire = false;
    } else {

      const decision = await confirm({
        message: `Globalyze can automatically wire the runtime provider.\n\nDetected framework: ${preview.framework}\nEntry file: ${preview.entryFile ? path.relative(config.rootDir, preview.entryFile) : "not detected"}\n\nProceed?`,
        initialValue: true
      });

      if (isCancel(decision)) {
        throw new GlobalyzeError("Runtime provider setup was cancelled.");
      }

      if (!decision) {
        const guidance = await setupRuntimeProvider(config, packageManager, {
          confirmWiring: false
        });
        if (guidance.guidancePath) {
          logger.info(`Generated runtime guidance at ${guidance.guidancePath}`);
        }
        if (guidance.languageSwitcherPath) {
          logger.info(
            `Generated language switcher example at ${guidance.languageSwitcherPath}`
          );
        }
        return;
      }

      shouldWire = true;
    }
  }

  const result = await setupRuntimeProvider(config, packageManager, {
    confirmWiring: shouldWire
  });

  if (result.alreadyWired && result.entryFile) {
    logger.info(result.skippedReason ?? "Runtime provider is already wired.");
  } else if (result.wired && result.entryFile) {
    logger.success(`Wired runtime provider in ${result.entryFile}`);
  } else if (result.guidancePath) {
    logger.warn(result.skippedReason ?? "Automatic runtime wiring was skipped.");
    logger.info(`Generated runtime guidance at ${result.guidancePath}`);
  }

  if (result.languageSwitcherPath) {
    logger.success(`Language switcher generated at ${result.languageSwitcherPath}`);
  }
  if (result.languageLabelsPath) {
    logger.info(`Language labels helper ready at ${result.languageLabelsPath}`);
  }
  if (result.localeHookPath) {
    logger.info(`Locale hook ready at ${result.localeHookPath}`);
  }
  if (result.devSwitcherInjected) {
    logger.success("Dev language switcher enabled");
  }
  if ((result.skippedArtifacts?.length ?? 0) > 0) {
    const skippedArtifacts = result.skippedArtifacts ?? [];
    logger.info(`Skipped existing runtime files: ${skippedArtifacts.join(", ")}`);
  }
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

async function promptI18nAdapter(): Promise<BuiltInI18nAdapter> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return "generic";
  }

  const adapter = await select({
    message: "Select i18n adapter",
    initialValue: "generic",
    options: [
      { label: "Generic (recommended)", value: "generic", hint: "safe default runtime" },
      { label: "react-i18next", value: "react-i18next", hint: "hook-based React runtime" },
      { label: "next-intl", value: "next-intl", hint: "Next.js runtime adapter" },
      { label: "react-intl", value: "react-intl", hint: "formatjs runtime adapter" },
      { label: "Custom", value: "custom", hint: "manual runtime wiring" }
    ]
  });

  if (isCancel(adapter)) {
    throw new GlobalyzeError("Adapter setup was cancelled.");
  }

  return adapter as BuiltInI18nAdapter;
}

async function promptGovernance(): Promise<TranslationGovernanceConfig> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      enabled: false,
      failOnLockedChange: true,
      failOnApprovalRequiredChange: false
    };
  }

  const enabled = await confirm({
    message: "Enable governance? (enterprise, big-team reviews)",
    initialValue: false
  });

  if (isCancel(enabled)) {
    throw new GlobalyzeError("Governance setup was cancelled.");
  }

  return {
    enabled,
    failOnLockedChange: true,
    failOnApprovalRequiredChange: false
  };
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
