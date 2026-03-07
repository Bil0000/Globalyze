import {
  cancel,
  intro,
  isCancel,
  outro,
  select
} from "@clack/prompts";

import { executeReportCommand } from "../commands/report";
import { executeRunCommand } from "../commands/run";
import { executeScanCommand } from "../commands/scan";
import { executeTransformCommand } from "../commands/transform";
import { executeTranslateCommand } from "../commands/translate";

export async function launchInteractiveCLI(): Promise<void> {
  intro("🌍 Globalyze — Automatic App Localization");

  const action = await select({
    message: "Select an action",
    options: [
      { label: "Scan project for strings", value: "scan" },
      { label: "Transform source code", value: "transform" },
      { label: "Generate translations", value: "translate" },
      { label: "Run full pipeline", value: "run" },
      { label: "Show translation report", value: "report" },
      { label: "Exit", value: "exit" }
    ]
  });

  if (isCancel(action) || action === "exit") {
    cancel("Exited Globalyze.");
    return;
  }

  if (action === "scan") {
    await executeScanCommand();
  }

  if (action === "transform") {
    await executeTransformCommand();
  }

  if (action === "translate") {
    await executeTranslateCommand();
  }

  if (action === "run") {
    await executeRunCommand();
  }

  if (action === "report") {
    await executeReportCommand();
  }

  outro("Done.");
}
