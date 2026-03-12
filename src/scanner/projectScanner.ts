import fg from "fast-glob";

import type { ResolvedGlobalyzeConfig } from "../types";
import { SUPPORTED_EXTENSIONS } from "../utils/fileUtils";

function buildIgnoredProjectPatterns(config: ResolvedGlobalyzeConfig): string[] {
  const ignorePatterns = config.ignore.flatMap((directory) => [
    `**/${directory}/**`,
    `${directory}/**`
  ]);

  return [
    ...ignorePatterns,
    "**/translations.generated.{ts,js}",
    "**/GlobalyzeLanguageSwitcher.{tsx,jsx}",
    "**/useLocale.{ts,tsx,js,jsx}",
    "**/languageLabels.{ts,js}"
  ];
}

export async function scanProjectFiles(
  config: ResolvedGlobalyzeConfig
): Promise<string[]> {
  const extensionPattern = SUPPORTED_EXTENSIONS.map((extension) =>
    extension.replace(".", "")
  ).join(",");

  const files = await fg([`**/*.{${extensionPattern}}`], {
    cwd: config.sourceDir,
    absolute: true,
    onlyFiles: true,
    ignore: [
      ...buildIgnoredProjectPatterns(config),
      "**/*.globalyze.{ts,js}"
    ],
    followSymbolicLinks: false
  });

  return files.sort((left, right) => left.localeCompare(right));
}

export async function scanProjectReferenceFiles(
  config: ResolvedGlobalyzeConfig
): Promise<string[]> {
  const extensionPattern = [".ts", ".tsx", ".js", ".jsx"]
    .map((extension) => extension.replace(".", ""))
    .join(",");

  const files = await fg([`**/*.{${extensionPattern}}`], {
    cwd: config.sourceDir,
    absolute: true,
    onlyFiles: true,
    ignore: buildIgnoredProjectPatterns(config),
    followSymbolicLinks: false
  });

  return files.sort((left, right) => left.localeCompare(right));
}
