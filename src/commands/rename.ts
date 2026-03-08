import { Command } from "commander";
import { parse } from "@babel/parser";
import generate from "@babel/generator";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import { extractTranslationKeyReferencesFromFiles } from "../extractor/translationKeyExtractor";
import { updateTranslationGraph } from "../graph/translationGraph";
import { readLocaleDictionary, writeLocaleDictionary } from "../i18n/localeManager";
import { scanProjectFiles } from "../scanner/projectScanner";
import type { GlobalyzeConfig } from "../types";
import { loadGlobalyzeConfig, readTextFile, writeTextFile } from "../utils/fileUtils";
import { logger } from "../utils/logger";

function buildOverrides(options: {
  sourceDir?: string;
  localesDir?: string;
}): Partial<GlobalyzeConfig> {
  return {
    ...(options.sourceDir ? { sourceDir: options.sourceDir } : {}),
    ...(options.localesDir ? { localesDir: options.localesDir } : {})
  };
}

function parseModule(source: string) {
  return parse(source, {
    sourceType: "module",
    plugins: [
      "jsx",
      "typescript",
      "classProperties",
      "classPrivateProperties",
      "topLevelAwait",
      "importAttributes"
    ]
  });
}

export function registerRenameCommand(program: Command): void {
  program
    .command("rename <oldKey> <newKey>")
    .description("Rename a translation key across the project")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(async (oldKey: string, newKey: string, options: { config?: string; sourceDir?: string; localesDir?: string }) => {
      await executeRenameCommand(oldKey, newKey, options);
    });
}

export async function executeRenameCommand(
  oldKey: string,
  newKey: string,
  options: { config?: string; sourceDir?: string; localesDir?: string } = {}
) {
  const config = await loadGlobalyzeConfig(options.config, buildOverrides(options));
  const files = await scanProjectFiles(config);

  for (const filePath of files) {
    const source = await readTextFile(filePath);
    const ast = parseModule(source);

    traverse(ast, {
      CallExpression(path) {
        if (
          !t.isIdentifier(path.node.callee, { name: config.translationFunctionName })
        ) {
          return;
        }

        const firstArg = path.node.arguments[0];

        if (!t.isStringLiteral(firstArg) || firstArg.value !== oldKey) {
          return;
        }

        firstArg.value = newKey;
      }
    });
    const output = `${generate(ast, {
      jsescOption: {
        minimal: true
      }
    }).code}\n`;

    if (output !== source) {
      await writeTextFile(filePath, output);
    }
  }

  for (const language of config.languages) {
    const locale = await readLocaleDictionary(config, language);

    if (!Object.hasOwn(locale, oldKey)) {
      continue;
    }
    const { [oldKey]: currentValue = "", ...rest } = locale;
    await writeLocaleDictionary(config, language, {
      ...rest,
      [newKey]: currentValue
    });
  }

  const references = await extractTranslationKeyReferencesFromFiles(
    files,
    config.translationFunctionName
  );
  await updateTranslationGraph(config, references);
  logger.success(`Renamed ${oldKey} to ${newKey}`);
}
