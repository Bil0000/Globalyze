import { buildProgram } from "./program";
import { launchInteractiveCLI } from "./interactive";

export async function runCLI(version: string): Promise<void> {
  if (process.argv.length <= 2) {
    await launchInteractiveCLI();
    return;
  }

  const program = buildProgram(version);
  await program.parseAsync(process.argv);
}
