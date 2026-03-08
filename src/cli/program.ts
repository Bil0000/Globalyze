import { Command } from "commander";

import { registerChangeStyleCommand } from "../commands/changeStyle";
import { registerCleanCommand } from "../commands/clean";
import { registerDuplicatesCommand } from "../commands/duplicates";
import { registerDynamicRemoveCommand } from "../commands/dynamicRemove";
import { registerInitCommand } from "../commands/init";
import { registerLanguagesCommand } from "../commands/languages";
import { registerPreviewCommand } from "../commands/preview";
import { registerReportCommand } from "../commands/report";
import { registerRunCommand } from "../commands/run";
import { registerScanCommand } from "../commands/scan";
import { registerScoreCommand } from "../commands/score";
import { registerScreenshotCommand } from "../commands/screenshot";
import { registerRenameCommand } from "../commands/rename";
import { registerTransformCommand } from "../commands/transform";
import { registerTranslateCommand } from "../commands/translate";
import { registerWatchCommand } from "../commands/watch";

export function buildProgram(version: string): Command {
  const program = new Command();

  program
    .name("globalyze")
    .description(
      "Automatically internationalize React and Next.js applications."
    )
    .version(version);

  registerInitCommand(program);
  registerChangeStyleCommand(program);
  registerDynamicRemoveCommand(program);
  registerLanguagesCommand(program);
  registerPreviewCommand(program);
  registerScanCommand(program);
  registerDuplicatesCommand(program);
  registerCleanCommand(program);
  registerRenameCommand(program);
  registerWatchCommand(program);
  registerScreenshotCommand(program);
  registerTransformCommand(program);
  registerTranslateCommand(program);
  registerReportCommand(program);
  registerScoreCommand(program);
  registerRunCommand(program);

  return program;
}
