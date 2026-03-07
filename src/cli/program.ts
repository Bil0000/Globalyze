import { Command } from "commander";

import { registerInitCommand } from "../commands/init";
import { registerRunCommand } from "../commands/run";
import { registerScanCommand } from "../commands/scan";
import { registerTransformCommand } from "../commands/transform";
import { registerTranslateCommand } from "../commands/translate";

export function buildProgram(version: string): Command {
  const program = new Command();

  program
    .name("globalyze")
    .description(
      "Automatically internationalize React and Next.js applications."
    )
    .version(version);

  registerInitCommand(program);
  registerScanCommand(program);
  registerTransformCommand(program);
  registerTranslateCommand(program);
  registerRunCommand(program);

  return program;
}
