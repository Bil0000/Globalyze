import fg from "fast-glob";

import type { ResolvedGlobalyzeConfig } from "../types";
import { SUPPORTED_EXTENSIONS } from "../utils/fileUtils";

export async function scanProjectFiles(
  config: ResolvedGlobalyzeConfig
): Promise<string[]> {
  const extensionPattern = SUPPORTED_EXTENSIONS.map((extension) =>
    extension.replace(".", "")
  ).join(",");

  const ignorePatterns = config.ignore.flatMap((directory) => [
    `**/${directory}/**`,
    `${directory}/**`
  ]);

  const files = await fg([`**/*.{${extensionPattern}}`], {
    cwd: config.sourceDir,
    absolute: true,
    onlyFiles: true,
    ignore: ignorePatterns,
    followSymbolicLinks: false
  });

  return files.sort((left, right) => left.localeCompare(right));
}
