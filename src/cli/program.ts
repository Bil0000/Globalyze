import { Command } from "commander";

import { registerChangeStyleCommand } from "../commands/changeStyle";
import { registerAnalyzeCommand } from "../commands/analyze";
import { registerAuditCommand } from "../commands/audit";
import { registerClassifyCommand } from "../commands/classify";
import { registerCleanCommand } from "../commands/clean";
import { registerDuplicatesCommand } from "../commands/duplicates";
import { registerDynamicRemoveCommand } from "../commands/dynamicRemove";
import { registerGlobalizeCommand } from "../commands/globalize";
import { registerInitCommand } from "../commands/init";
import { registerInspectGroupCommand } from "../commands/inspectGroup";
import { registerLockCommand, registerUnlockCommand } from "../commands/lock";
import { registerLanguagesCommand } from "../commands/languages";
import { registerOwnerCommand } from "../commands/owner";
import { registerPreviewCommand } from "../commands/preview";
import { registerScanCommand } from "../commands/scan";
import { registerScreenshotCommand } from "../commands/screenshot";
import { registerRenameCommand } from "../commands/rename";
import { registerSyncCommand } from "../commands/sync";
import { registerUpdateCommand } from "../commands/update";
import { registerWatchCommand } from "../commands/watch";

export function buildProgram(version: string): Command {
  const program = new Command();

  program
    .name("globalyze")
    .usage("<command>")
    .description("Globalyze CLI")
    .summary("Automatically internationalize React applications.")
    .version(version);

  program.addHelpText(
    "after",
    [
      "",
      "Primary Commands:",
      "  globalize      Convert a project to use internationalization",
      "  sync           Update translations and locale files",
      "  watch          Run Globalyze in development watch mode",
      "  analyze        Show localization diagnostics",
      "  clean          Remove unused translations",
      "  audit          Audit remaining extractable UI strings",
      "  update         Update the globally installed CLI",
      "",
      "Maintenance:",
      "  duplicates     Detect duplicate translation keys",
      "  rename         Rename a translation key across the project",
      "  dynamic-remove Revert dynamic extraction transforms",
      "  style          Change locale file structure style",
      "",
      "Inspection Commands:",
      "  inspect        Inspect keys, usages, locale data, and graph state",
      "  classify       Inspect or fix ownership classification",
      "",
      "Governance:",
      "  owner          Assign translation ownership",
      "  lock           Lock a translation key",
      "  unlock         Unlock a translation key",
      ""
    ].join("\n")
  );

  registerInitCommand(program);
  registerGlobalizeCommand(program);
  registerSyncCommand(program);
  registerAnalyzeCommand(program);
  registerAuditCommand(program);
  registerChangeStyleCommand(program);
  registerDynamicRemoveCommand(program);
  registerLanguagesCommand(program);
  registerPreviewCommand(program);
  registerScanCommand(program);
  registerInspectGroupCommand(program);
  registerClassifyCommand(program);
  registerDuplicatesCommand(program);
  registerCleanCommand(program);
  registerRenameCommand(program);
  registerOwnerCommand(program);
  registerLockCommand(program);
  registerUnlockCommand(program);
  registerWatchCommand(program);
  registerScreenshotCommand(program);
  registerUpdateCommand(program, version);

  return program;
}
