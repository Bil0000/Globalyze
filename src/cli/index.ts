import { buildProgram } from "./program";
import { launchInteractiveCLI } from "./interactive";
import { ensureGlobalyzeState } from "../state/globalyzeState";

export async function runCLI(version: string): Promise<void> {
  if (process.argv.length <= 2) {
    await ensureGlobalyzeState();
    await launchInteractiveCLI();
    return;
  }

  const program = buildProgram(version);
  program.hook("preAction", async () => {
    await ensureGlobalyzeState();
  });
  await program.parseAsync(process.argv);
}
