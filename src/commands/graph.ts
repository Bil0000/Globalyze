import { Command } from "commander";

import { readTranslationGraph } from "../graph/translationGraph";
import { summarizeTranslationGraph } from "../inspection/translationInspector";
import type { GlobalyzeConfig } from "../types";
import { loadGlobalyzeConfig } from "../utils/fileUtils";
import { logger } from "../utils/logger";
import { resolveNameMetadata } from "../utils/nameResolver";

function buildOverrides(options: {
  sourceDir?: string;
  localesDir?: string;
}): Partial<GlobalyzeConfig> {
  return {
    ...(options.sourceDir ? { sourceDir: options.sourceDir } : {}),
    ...(options.localesDir ? { localesDir: options.localesDir } : {})
  };
}

function hasNormalizedName(
  values: Iterable<string>,
  expected: string | undefined
): boolean {
  if (!expected) {
    return true;
  }

  for (const value of values) {
    if (value.toLowerCase() === expected) {
      return true;
    }
  }

  return false;
}

export function registerGraphCommand(program: Command): void {
  program
    .command("graph")
    .description("View translation graph summary")
    .summary("Inspect graph totals, top pages, and filtered keys")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .option("--page <name>", "Show only keys belonging to a page")
    .option("--component <name>", "Show only keys belonging to a component")
    .option("--visual", "Render the graph as a compact tree view", false)
    .action(
      async (options: {
        config?: string;
        sourceDir?: string;
        localesDir?: string;
        page?: string;
        component?: string;
        visual?: boolean;
      }) => {
        await executeGraphCommand(options);
      }
    );
}

export function buildVisualGraph(
  graph: Awaited<ReturnType<typeof readTranslationGraph>>,
  filters: {
    page?: string;
    component?: string;
  }
): string[] {
  const groups = new Map<string, string[]>();
  const normalizedPage = filters.page?.trim().toLowerCase();
  const normalizedComponent = filters.component?.trim().toLowerCase();

  for (const [key, entry] of Object.entries(graph)) {
    const pageNames = new Set<string>();
    const componentNames = new Set<string>();

    if (entry.pageNames && entry.pageNames.length > 0) {
      for (const pageName of entry.pageNames) {
        pageNames.add(pageName);
      }
    } else if (entry.pageName) {
      pageNames.add(entry.pageName);
    }
    if (entry.componentName) {
      componentNames.add(entry.componentName);
    }

    if (pageNames.size === 0 || componentNames.size === 0) {
      for (const filePath of [entry.originFile, ...entry.usages]) {
        const metadata = resolveNameMetadata(filePath);

        if (metadata.type === "page" && pageNames.size === 0) {
          pageNames.add(metadata.name);
        } else if (metadata.type === "component" && componentNames.size === 0) {
          componentNames.add(metadata.name);
        }
      }
    }

    const matchesPage =
      hasNormalizedName(pageNames, normalizedPage);
    const matchesComponent =
      hasNormalizedName(componentNames, normalizedComponent);

    if (!matchesPage || !matchesComponent) {
      continue;
    }

    const groupNames =
      normalizedComponent && componentNames.size > 0
        ? [...componentNames].sort((left, right) => left.localeCompare(right))
        : pageNames.size > 0
          ? [...pageNames].sort((left, right) => left.localeCompare(right))
          : ["unknown"];

    for (const groupName of groupNames) {
      const groupType =
        normalizedComponent && componentNames.has(groupName) ? "component" : "page";
      const label = `${groupName}.${groupType}`;
      const keys = groups.get(label) ?? [];
      keys.push(key);
      groups.set(label, keys);
    }
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([label, keys]) => [
      label,
      ...[...new Set(keys)]
        .sort((left, right) => left.localeCompare(right))
        .map((key, index, all) => `${index === all.length - 1 ? "└" : "├"} ${key}`)
    ]);
}

export async function executeGraphCommand(
  options: {
    config?: string;
    sourceDir?: string;
    localesDir?: string;
    page?: string;
    component?: string;
    visual?: boolean;
  } = {}
) {
  const config = await loadGlobalyzeConfig(options.config, buildOverrides(options));
  const summary = await summarizeTranslationGraph(config, {
    page: options.page,
    component: options.component
  });
  const graph = options.visual ? await readTranslationGraph(config.rootDir) : null;

  logger.heading("Translation Graph");
  logger.info(`Total Keys: ${String(summary.totalKeys)}`);
  logger.info(`Pages: ${String(summary.totalPages)}`);
  logger.info(`Components: ${String(summary.totalComponents)}`);

  if (summary.topPages.length > 0) {
    logger.newline();
    logger.heading("Top Pages");
    logger.list(
      summary.topPages.map(
        (entry) => `${entry.name} (${String(entry.count)} keys)`
      )
    );
  }

  if (options.page || options.component) {
    logger.newline();
    logger.heading("Matching Keys");

    if (summary.matchingKeys.length === 0) {
      logger.info("No keys matched the current filter.");
    } else {
      logger.list(summary.matchingKeys);
    }
  }

  if (options.visual && graph) {
    const lines = buildVisualGraph(graph, {
      page: options.page,
      component: options.component
    });

    logger.newline();
    logger.heading("Visual Graph");

    if (lines.length === 0) {
      logger.info("No graph relationships matched the current filter.");
    } else {
      for (const line of lines) {
        console.log(line);
      }
    }
  }

  return summary;
}
