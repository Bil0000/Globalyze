import path from "node:path";

import fs from "fs-extra";

import type {
  LocaleKeyReference,
  ResolvedGlobalyzeConfig,
  TranslationGraph
} from "../types";
import { readLocaleEntries } from "../i18n/localeManager";
import { buildLocaleFileContents } from "../i18n/writers/shared";
import { resolveGlobalyzeRootDir, toRelativePosixPath } from "../utils/fileUtils";

function getGraphPath(): string {
  return path.join(
    resolveGlobalyzeRootDir(),
    ".globalyze",
    "translationGraph.json"
  );
}

function getLegacyGraphPath(): string {
  return path.join(
    resolveGlobalyzeRootDir(),
    ".cache",
    "globalyze",
    "translationGraph.json"
  );
}

export async function readTranslationGraph(): Promise<TranslationGraph> {
  const graphPath = getGraphPath();

  if (await fs.pathExists(graphPath)) {
    return (await fs.readJson(graphPath)) as TranslationGraph;
  }

  const legacyGraphPath = getLegacyGraphPath();

  if (!(await fs.pathExists(legacyGraphPath))) {
    return {};
  }

  return (await fs.readJson(legacyGraphPath)) as TranslationGraph;
}

export async function writeTranslationGraph(graph: TranslationGraph): Promise<void> {
  const graphPath = getGraphPath();
  await fs.ensureDir(path.dirname(graphPath));
  await fs.writeJson(graphPath, graph, { spaces: 2 });
  await fs.remove(getLegacyGraphPath());
}

export async function updateTranslationGraph(
  config: ResolvedGlobalyzeConfig,
  references: readonly LocaleKeyReference[]
): Promise<TranslationGraph> {
  const sourceLocale = await readLocaleEntries(config, config.sourceLocale);
  const graph: TranslationGraph = {};
  const referencedKeys = [...new Set(references.map((reference) => reference.key))]
    .filter((key) => typeof sourceLocale[key]?.value === "string");
  const fileContents = buildLocaleFileContents(
    config.sourceLocale,
    Object.fromEntries(
      referencedKeys
        .map((key) => [key, sourceLocale[key]] as const)
        .filter((entry): entry is readonly [string, NonNullable<(typeof sourceLocale)[string]>] => !!entry[1])
    ),
    Object.fromEntries(
      referencedKeys
        .map((key) => [key, sourceLocale[key]] as const)
        .filter((entry): entry is readonly [string, NonNullable<(typeof sourceLocale)[string]>] => !!entry[1])
    ),
    config.localeStructure,
    references,
    config.sourceLocale
  );

  const localeFileByKey = new Map<string, string>();

  for (const file of fileContents) {
    for (const key of Object.keys(file.entries)) {
      localeFileByKey.set(key, file.fileName);
    }
  }

  for (const key of referencedKeys) {
    const keyReferences = references.filter((reference) => reference.key === key);
    const usages = keyReferences.map((reference) =>
      toRelativePosixPath(config.rootDir, reference.file)
    );
    const originFile = usages[0];
    const pageNames = [...new Set(
      keyReferences
        .flatMap((reference) =>
          reference.pageNames && reference.pageNames.length > 0
            ? reference.pageNames
            : reference.pageName
              ? [reference.pageName]
              : []
        )
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )];
    const componentNames = [...new Set(
      keyReferences
        .map((reference) => reference.componentName)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )];
    const sourceTypes = [...new Set(
      keyReferences
        .map((reference) => reference.sourceType)
        .filter((value): value is "page" | "component" =>
          value === "page" || value === "component"
        )
    )];

    if (!originFile) {
      continue;
    }

    graph[key] = {
      text: sourceLocale[key]?.value ?? "",
      originFile,
      localeFile: localeFileByKey.get(key) ?? "",
      usages: [...new Set(usages)],
      pageName: pageNames.length === 1 ? pageNames[0] : undefined,
      pageNames: pageNames.length > 1 ? pageNames : undefined,
      componentName: componentNames.length === 1 ? componentNames[0] : undefined,
      sourceType: sourceTypes.length === 1 ? sourceTypes[0] : undefined,
      owner: sourceLocale[key]?.owner,
      locked: sourceLocale[key]?.locked,
      approvalRequired: sourceLocale[key]?.approvalRequired
    };
  }

  await writeTranslationGraph(graph);
  return graph;
}
