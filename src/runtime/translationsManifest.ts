import path from "node:path";

import fg from "fast-glob";
import fs from "fs-extra";

import { buildJsLocaleExportName } from "../i18n/writers/shared";
import { detectRuntimeArtifactFlavor } from "./languageArtifacts";
import type { ResolvedGlobalyzeConfig } from "../types";
import { toPosixPath, writeTextFile } from "../utils/fileUtils";
import { formatGeneratedFileContents } from "../utils/projectFormatter";

interface LocaleModuleDescriptor {
  fileName: string;
  filePath: string;
}

interface CanonicalLocaleModuleDescriptor {
  fileName: string;
  modulesByLanguage: Record<string, LocaleModuleDescriptor | undefined>;
}

function buildImportAlias(language: string, fileName: string): string {
  const normalizedLanguage = language
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const normalizedBase = baseName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toLowerCase();

  return `${normalizedLanguage || "locale"}_${normalizedBase || "locale"}`;
}

function buildLanguageVariableName(language: string): string {
  const normalized = language
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return `locale_${normalized || "unknown"}`;
}

function buildManifestImportPath(
  manifestDirectory: string,
  filePath: string,
  format: ResolvedGlobalyzeConfig["localeStructure"]["format"]
): string {
  const relativeImportPath = toPosixPath(
    path.relative(manifestDirectory, filePath)
  ).replace(/^([^./])/, "./$1");

  if (format === "ts") {
    return relativeImportPath.replace(/\.ts$/, "");
  }

  return relativeImportPath;
}

async function findGeneratedManifestPaths(
  config: ResolvedGlobalyzeConfig
): Promise<string[]> {
  const matches = await fg(["**/translations.generated.{ts,js}"], {
    cwd: config.rootDir,
    absolute: true,
    onlyFiles: true,
    ignore: [...config.ignore.map((segment) => `${segment}/**`), "locales/**"]
  });

  return matches.sort((left, right) => left.localeCompare(right));
}

async function resolveDefaultGeneratedManifestPath(
  config: ResolvedGlobalyzeConfig
): Promise<string> {
  const flavor = await detectRuntimeArtifactFlavor(config);
  const extension = flavor === "typescript" ? "ts" : "js";

  return path.join(
    config.sourceDir,
    "lib",
    "i18n",
    `translations.generated.${extension}`
  );
}

async function readLocaleModulesForLanguage(
  config: ResolvedGlobalyzeConfig,
  language: string
): Promise<LocaleModuleDescriptor[]> {
  const languageDirectory = path.join(config.localesDir, language);

  if (!(await fs.pathExists(languageDirectory))) {
    return [];
  }

  const fileNames = (await fs.readdir(languageDirectory))
    .filter(
      (fileName) =>
        fileName.endsWith(`.${config.localeStructure.format}`) &&
        !fileName.startsWith(".")
    )
    .sort((left, right) => left.localeCompare(right));

  return fileNames.map((fileName) => ({
    fileName,
    filePath: path.join(languageDirectory, fileName)
  }));
}

function buildManifestContents(
  manifestPath: string,
  config: ResolvedGlobalyzeConfig,
  modulesByLanguage: Record<string, LocaleModuleDescriptor[]>
): string {
  const manifestDirectory = path.dirname(manifestPath);
  const isTypeScriptManifest = manifestPath.endsWith(".ts");
  const importLines: string[] = [];
  const languageObjectLines: string[] = [];

  const canonicalFileNames = [
    ...new Set(
      [
        ...(modulesByLanguage[config.sourceLocale] ?? []),
        ...Object.values(modulesByLanguage).flat()
      ].map((module) => module.fileName)
    )
  ].sort((left, right) => left.localeCompare(right));

  const canonicalModules: CanonicalLocaleModuleDescriptor[] = canonicalFileNames.map(
    (fileName) => ({
      fileName,
      modulesByLanguage: Object.fromEntries(
        config.languages.map((language) => [
          language,
          (modulesByLanguage[language] ?? []).find(
            (module) => module.fileName === fileName
          )
        ])
      ) as Record<string, LocaleModuleDescriptor | undefined>
    })
  );

  for (const language of config.languages) {
    const importAliases: string[] = [];
    const languageVariableName = buildLanguageVariableName(language);

    for (const moduleDescriptor of canonicalModules) {
      const module = moduleDescriptor.modulesByLanguage[language];
      const importAlias = buildImportAlias(language, moduleDescriptor.fileName);
      importAliases.push(importAlias);

      if (!module) {
        languageObjectLines.push(
          isTypeScriptManifest
            ? `const ${importAlias} = {} as const;`
            : `const ${importAlias} = {};`
        );
        continue;
      }

      const relativeImportPath = buildManifestImportPath(
        manifestDirectory,
        module.filePath,
        config.localeStructure.format
      );

      if (
        config.localeStructure.format === "js" ||
        config.localeStructure.format === "ts"
      ) {
        importLines.push(
          `import { ${buildJsLocaleExportName(module.fileName)} as ${importAlias} } from "${relativeImportPath}";`
        );
      } else {
        importLines.push(
          `import ${importAlias} from "${relativeImportPath}";`
        );
      }
    }

    if (importAliases.length === 0) {
      languageObjectLines.push(
        isTypeScriptManifest
          ? `const ${languageVariableName} = {} as const;`
          : `const ${languageVariableName} = {};`
      );
      continue;
    }

    languageObjectLines.push(
      `const ${languageVariableName} = {`,
      ...importAliases.map((alias) => `  ...${alias},`),
      isTypeScriptManifest ? "} as const;" : "};"
    );
  }

  return [
    "// This file is generated by Globalyze. Do not edit manually.",
    "",
    ...importLines,
    ...(importLines.length > 0 ? [""] : []),
    ...languageObjectLines,
    "",
    "export const translations = {",
    ...config.languages.map(
      (language) =>
        `  ${JSON.stringify(language)}: ${buildLanguageVariableName(language)},`
    ),
    isTypeScriptManifest ? "} as const;" : "};",
    ...(isTypeScriptManifest
      ? ["", "export type TranslationLocale = keyof typeof translations;"]
      : []),
    "",
    `export function getTranslations(${isTypeScriptManifest ? "locale: string" : "locale"}) {`,
    isTypeScriptManifest
      ? `  return translations[locale as TranslationLocale] ?? translations[${JSON.stringify(config.sourceLocale)}];`
      : `  return translations[locale] ?? translations[${JSON.stringify(config.sourceLocale)}];`,
    "}",
    "",
    "export default translations;",
    ""
  ].join("\n");
}

export async function refreshGeneratedTranslationManifests(
  config: ResolvedGlobalyzeConfig
): Promise<string[]> {
  const existingManifestPaths = await findGeneratedManifestPaths(config);
  const manifestPaths =
    existingManifestPaths.length > 0
      ? existingManifestPaths
      : [await resolveDefaultGeneratedManifestPath(config)];

  const modulesByLanguageEntries = await Promise.all(
    config.languages.map(async (language) => [
      language,
      await readLocaleModulesForLanguage(config, language)
    ] as const)
  );
  const modulesByLanguage = Object.fromEntries(modulesByLanguageEntries) as Record<
    string,
    LocaleModuleDescriptor[]
  >;

  await Promise.all(
    manifestPaths.map(async (manifestPath) => {
      const contents = buildManifestContents(manifestPath, config, modulesByLanguage);
      await writeTextFile(
        manifestPath,
        await formatGeneratedFileContents(manifestPath, contents)
      );
    })
  );

  return manifestPaths;
}
