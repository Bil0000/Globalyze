import { Command } from "commander";

import { registerChangeStyleCommand } from "../commands/changeStyle";
import { registerAuditCommand } from "../commands/audit";
import { registerClassifyCommand } from "../commands/classify";
import { registerCleanCommand } from "../commands/clean";
import { registerDoctorCommand } from "../commands/doctor";
import { registerDuplicatesCommand } from "../commands/duplicates";
import { registerDynamicRemoveCommand } from "../commands/dynamicRemove";
import { registerGraphCommand } from "../commands/graph";
import { registerGlobalizeCommand } from "../commands/globalize";
import { registerInitCommand } from "../commands/init";
import { registerInspectCommand } from "../commands/inspect";
import { registerLockCommand, registerUnlockCommand } from "../commands/lock";
import { registerLanguagesCommand } from "../commands/languages";
import { registerLocalesCommand } from "../commands/locales";
import { registerOwnerCommand } from "../commands/owner";
import { registerPreviewCommand } from "../commands/preview";
import { registerReportCommand } from "../commands/report";
import { registerRunCommand } from "../commands/run";
import { registerScanCommand } from "../commands/scan";
import { registerScoreCommand } from "../commands/score";
import { registerScreenshotCommand } from "../commands/screenshot";
import { registerSearchCommand } from "../commands/search";
import { registerRenameCommand } from "../commands/rename";
import { registerSyncCommand } from "../commands/sync";
import { registerTransformCommand } from "../commands/transform";
import { registerTranslateCommand } from "../commands/translate";
import { registerWatchCommand } from "../commands/watch";
import { registerWhereCommand } from "../commands/where";

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
      "  report         Show localization statistics",
      "  clean          Remove unused translations",
      "  audit          Audit remaining extractable UI strings",
      "",
      "Maintenance:",
      "  duplicates     Detect duplicate translation keys",
      "  rename         Rename a translation key across the project",
      "  dynamic-remove Revert dynamic extraction transforms",
      "  change-style   Change locale file structure style",
      "",
      "Inspection Commands:",
      "  inspect        Inspect a translation key",
      "  graph          View translation graph summary",
      "  classify       Inspect or fix ownership classification",
      "  where          Show where a key is used",
      "  locales        Inspect locale files",
      "  search         Search translations by text",
      "  doctor         Show localization health report",
      "",
      "Governance:",
      "  owner          Assign translation ownership",
      "  lock           Lock a translation key",
      "  unlock         Unlock a translation key",
      "",
      "Legacy:",
      "  run            Deprecated alias for sync",
      ""
    ].join("\n")
  );

  registerInitCommand(program);
  registerGlobalizeCommand(program);
  registerSyncCommand(program);
  registerAuditCommand(program);
  registerChangeStyleCommand(program);
  registerDynamicRemoveCommand(program);
  registerLanguagesCommand(program);
  registerPreviewCommand(program);
  registerScanCommand(program);
  registerInspectCommand(program);
  registerGraphCommand(program);
  registerClassifyCommand(program);
  registerWhereCommand(program);
  registerLocalesCommand(program);
  registerSearchCommand(program);
  registerDoctorCommand(program);
  registerDuplicatesCommand(program);
  registerCleanCommand(program);
  registerRenameCommand(program);
  registerOwnerCommand(program);
  registerLockCommand(program);
  registerUnlockCommand(program);
  registerWatchCommand(program);
  registerScreenshotCommand(program);
  registerTransformCommand(program);
  registerTranslateCommand(program);
  registerReportCommand(program);
  registerScoreCommand(program);
  registerRunCommand(program);

  return program;
}
