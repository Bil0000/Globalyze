import { Command } from "commander";

import { executeGraphCommand } from "./graph";
import { executeInspectCommand } from "./inspect";
import { executeLocalesCommand } from "./locales";
import { executeSearchCommand } from "./search";
import { executeWhereCommand } from "./where";

export function registerInspectGroupCommand(program: Command): void {
  const inspect = program
    .command("inspect")
    .description("Inspect translations, usages, locale data, and graph state")
    .summary("Grouped translation inspection commands");

  inspect
    .command("key <key>")
    .description("Inspect a translation key")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (
        key: string,
        options: { config?: string; sourceDir?: string; localesDir?: string }
      ) => {
        await executeInspectCommand(key, options);
      }
    );

  inspect
    .command("where <key>")
    .description("Show where a key is used")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (
        key: string,
        options: { config?: string; sourceDir?: string; localesDir?: string }
      ) => {
        await executeWhereCommand(key, options);
      }
    );

  inspect
    .command("search <text>")
    .description("Search translations by text")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (
        text: string,
        options: { config?: string; sourceDir?: string; localesDir?: string }
      ) => {
        await executeSearchCommand(text, options);
      }
    );

  inspect
    .command("locales <language> [scope]")
    .description("Inspect locale files")
    .option("-c, --config <path>", "Path to a Globalyze config file")
    .option("--source-dir <path>", "Override the configured source directory")
    .option("--locales-dir <path>", "Override the configured locales directory")
    .action(
      async (
        language: string,
        scope: string | undefined,
        options: { config?: string; sourceDir?: string; localesDir?: string }
      ) => {
        await executeLocalesCommand(language, scope, options);
      }
    );

  inspect
    .command("graph")
    .description("View translation graph summary")
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
