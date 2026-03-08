import {
  cancel,
  intro,
  isCancel,
  outro,
  select,
  text
} from "@clack/prompts";

import { executeReportCommand } from "../commands/report";
import { executeScanCommand } from "../commands/scan";
import { executeScoreCommand } from "../commands/score";
import { executeScreenshotCommand } from "../commands/screenshot";
import { executeSyncCommand } from "../commands/sync";
import { executeTransformCommand } from "../commands/transform";
import { executeTranslateCommand } from "../commands/translate";
import { executePreviewCommand } from "../commands/preview";
import { executeWatchCommand } from "../commands/watch";
import { executeAddLanguagesCommand } from "../commands/languages";
import { executeChangeStyleCommand } from "../commands/changeStyle";
import { executeCleanCommand } from "../commands/clean";
import { executeDuplicatesCommand } from "../commands/duplicates";
import { executeDynamicRemoveCommand } from "../commands/dynamicRemove";
import { executeGlobalizeCommand } from "../commands/globalize";
import { executeLockCommand, executeUnlockCommand } from "../commands/lock";
import { executeOwnerCommand } from "../commands/owner";

export async function launchInteractiveCLI(): Promise<void> {
  intro("🌍 Globalyze — Automatic App Localization");

  const action = await select({
    message: "Select an action",
    options: [
      { label: "Scan project for strings", value: "scan" },
      { label: "Globalize project", value: "globalize" },
      { label: "Sync translations", value: "sync" },
      { label: "Add languages to config", value: "languages" },
      { label: "Change locale file style", value: "style" },
      { label: "Remove dynamic translations", value: "dynamic-remove" },
      { label: "Preview transformations", value: "preview" },
      { label: "Transform source code", value: "transform" },
      { label: "Generate translations", value: "translate" },
      { label: "Show duplicate translations", value: "duplicates" },
      { label: "Clean unused locale keys", value: "clean" },
      { label: "Assign translation owner", value: "owner" },
      { label: "Lock or unlock a key", value: "locking" },
      { label: "Watch for new strings", value: "watch" },
      { label: "Analyze screenshot", value: "screenshot" },
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

  if (action === "globalize") {
    await executeGlobalizeCommand();
  }

  if (action === "sync") {
    await executeSyncCommand();
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

  if (action === "style") {
    await executeChangeStyleCommand();
  }

  if (action === "dynamic-remove") {
    await executeDynamicRemoveCommand();
  }

  if (action === "transform") {
    await executeTransformCommand();
  }

  if (action === "translate") {
    await executeTranslateCommand();
  }

  if (action === "duplicates") {
    await executeDuplicatesCommand();
  }

  if (action === "clean") {
    await executeCleanCommand();
  }

  if (action === "owner") {
    const key = await text({
      message: "Translation key"
    });
    const team = await text({
      message: "Owner team"
    });

    if (
      isCancel(key) ||
      isCancel(team) ||
      key.trim().length === 0 ||
      team.trim().length === 0
    ) {
      cancel("Ownership update cancelled.");
      return;
    }

    await executeOwnerCommand(key.trim(), team.trim());
  }

  if (action === "locking") {
    const operation = await select({
      message: "Choose a lock action",
      options: [
        { label: "Lock key", value: "lock" },
        { label: "Unlock key", value: "unlock" }
      ]
    });
    const key = await text({
      message: "Translation key"
    });

    if (isCancel(operation) || isCancel(key) || key.trim().length === 0) {
      cancel("Lock update cancelled.");
      return;
    }

    if (operation === "lock") {
      await executeLockCommand(key.trim());
    } else {
      await executeUnlockCommand(key.trim());
    }
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

  if (action === "report") {
    await executeReportCommand();
  }

  if (action === "score") {
    await executeScoreCommand();
  }

  outro("Done.");
}
