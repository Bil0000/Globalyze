import {
  cancel,
  intro,
  isCancel,
  outro,
  select,
  text
} from "@clack/prompts";

import { executeReportCommand } from "../commands/report";
import { executeRunCommand } from "../commands/run";
import { executeScanCommand } from "../commands/scan";
import { executeScoreCommand } from "../commands/score";
import { executeScreenshotCommand } from "../commands/screenshot";
import { executeTransformCommand } from "../commands/transform";
import { executeTranslateCommand } from "../commands/translate";
import { executePreviewCommand } from "../commands/preview";
import { executeWatchCommand } from "../commands/watch";
import { executeAddLanguagesCommand } from "../commands/languages";

export async function launchInteractiveCLI(): Promise<void> {
  intro("🌍 Globalyze — Automatic App Localization");

  const action = await select({
    message: "Select an action",
    options: [
      { label: "Scan project for strings", value: "scan" },
      { label: "Add languages to config", value: "languages" },
      { label: "Preview transformations", value: "preview" },
      { label: "Transform source code", value: "transform" },
      { label: "Generate translations", value: "translate" },
      { label: "Watch for new strings", value: "watch" },
      { label: "Analyze screenshot", value: "screenshot" },
      { label: "Run full pipeline", value: "run" },
      { label: "Show translation report", value: "report" },
      { label: "Show project score", value: "score" },
      { label: "Exit", value: "exit" }
    ]
  });

  if (isCancel(action) || action === "exit") {
    cancel("Exited Globalyze.");
    return;
  }

  if (action === "preview") {
    await executePreviewCommand();
  }

  if (action === "scan") {
    await executeScanCommand();
  }

  if (action === "languages") {
    const codes = await text({
      message: "Language codes to add (comma separated)"
    });

    if (isCancel(codes) || codes.trim().length === 0) {
      cancel("Language update cancelled.");
      return;
    }

    await executeAddLanguagesCommand(codes.split(","));
  }

  if (action === "transform") {
    await executeTransformCommand();
  }

  if (action === "translate") {
    await executeTranslateCommand();
  }

  if (action === "watch") {
    await executeWatchCommand();
  }

  if (action === "screenshot") {
    const imagePath = await text({
      message: "Path to the screenshot image"
    });

    if (isCancel(imagePath) || imagePath.trim().length === 0) {
      cancel("Screenshot analysis cancelled.");
      return;
    }

    await executeScreenshotCommand(imagePath);
  }

  if (action === "run") {
    await executeRunCommand();
  }

  if (action === "report") {
    await executeReportCommand();
  }

  if (action === "score") {
    await executeScoreCommand();
  }

  outro("Done.");
}
