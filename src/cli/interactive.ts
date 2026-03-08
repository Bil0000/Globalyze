import {
  cancel,
  intro,
  isCancel,
  outro,
  select,
  text
} from "@clack/prompts";

import { executeReportCommand } from "../commands/report";
import { executeRenameCommand } from "../commands/rename";
import { executeScanCommand } from "../commands/scan";
import { executeScoreCommand } from "../commands/score";
import { executeScreenshotCommand } from "../commands/screenshot";
import { executeSyncCommand } from "../commands/sync";
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
  intro("Globalyze CLI");

  const action = await select({
    message: "Select an action",
    options: [
      { label: "1. Globalize project", value: "globalize" },
      { label: "2. Sync translations", value: "sync" },
      { label: "3. Watch for changes", value: "watch" },
      { label: "4. Show localization report", value: "report" },
      { label: "5. Clean unused translations", value: "clean" },
      { label: "6. Detect duplicate keys", value: "duplicates" },
      { label: "7. Rename translation key", value: "rename" },
      { label: "8. Change locale structure style", value: "style" },
      { label: "9. Scan project for strings", value: "scan" },
      { label: "10. Add languages to config", value: "languages" },
      { label: "11. Remove dynamic translations", value: "dynamic-remove" },
      { label: "12. Preview transformations", value: "preview" },
      { label: "13. Generate translations", value: "translate" },
      { label: "14. Assign translation owner", value: "owner" },
      { label: "15. Lock or unlock a key", value: "locking" },
      { label: "16. Analyze screenshot", value: "screenshot" },
      { label: "17. Show project score", value: "score" },
      { label: "18. Exit", value: "exit" }
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

  if (action === "translate") {
    await executeTranslateCommand();
  }

  if (action === "duplicates") {
    await executeDuplicatesCommand();
  }

  if (action === "rename") {
    const oldKey = await text({
      message: "Current translation key"
    });
    const newKey = await text({
      message: "New translation key"
    });

    if (
      isCancel(oldKey) ||
      isCancel(newKey) ||
      oldKey.trim().length === 0 ||
      newKey.trim().length === 0
    ) {
      cancel("Rename cancelled.");
      return;
    }

    await executeRenameCommand(oldKey.trim(), newKey.trim());
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
