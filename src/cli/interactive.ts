import {
  cancel,
  intro,
  isCancel,
  outro,
  select,
  text
} from "@clack/prompts";

import { executeAnalyzeCommand } from "../commands/analyze";
import { executeAuditCommand } from "../commands/audit";
import { executeRenameCommand } from "../commands/rename";
import { executeScanCommand } from "../commands/scan";
import { executeScreenshotCommand } from "../commands/screenshot";
import { executeSearchCommand } from "../commands/search";
import { executeSyncCommand } from "../commands/sync";
import { executePreviewCommand } from "../commands/preview";
import { executeWatchCommand } from "../commands/watch";
import { executeAddLanguagesCommand } from "../commands/languages";
import { executeChangeStyleCommand } from "../commands/changeStyle";
import { executeClassifyCommand } from "../commands/classify";
import { executeCleanCommand } from "../commands/clean";
import { executeDuplicatesCommand } from "../commands/duplicates";
import { executeDynamicRemoveCommand } from "../commands/dynamicRemove";
import { executeGraphCommand } from "../commands/graph";
import { executeGlobalizeCommand } from "../commands/globalize";
import { executeInspectCommand } from "../commands/inspect";
import { executeLockCommand, executeUnlockCommand } from "../commands/lock";
import { executeLocalesCommand } from "../commands/locales";
import { executeOwnerCommand } from "../commands/owner";
import { executeWhereCommand } from "../commands/where";

export async function launchInteractiveCLI(): Promise<void> {
  intro("Globalyze CLI");

  const action = await select({
    message: "Select an action",
    options: [
      { label: "1. Globalize project", value: "globalize" },
      { label: "2. Sync translations", value: "sync" },
      { label: "3. Watch for changes", value: "watch" },
      { label: "4. Analyze localization health", value: "analyze" },
      { label: "5. Audit remaining extractable strings", value: "audit" },
      { label: "6. Clean unused translations", value: "clean" },
      { label: "7. Inspect translations and locale state", value: "inspect" },
      { label: "8. Classify ownership", value: "classify" },
      { label: "9. Detect duplicate keys", value: "duplicates" },
      { label: "10. Rename translation key", value: "rename" },
      { label: "11. Change locale structure style", value: "style" },
      { label: "12. Scan project for strings", value: "scan" },
      { label: "13. Add languages to config", value: "languages" },
      { label: "14. Remove dynamic translations", value: "dynamic-remove" },
      { label: "15. Preview transformations", value: "preview" },
      { label: "16. Assign translation owner", value: "owner" },
      { label: "17. Lock or unlock a key", value: "locking" },
      { label: "18. Analyze screenshot", value: "screenshot" },
      { label: "19. Exit", value: "exit" }
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

  if (action === "audit") {
    await executeAuditCommand();
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

  if (action === "analyze") {
    await executeAnalyzeCommand();
  }

  if (action === "inspect") {
    const mode = await select({
      message: "Choose an inspection view",
      options: [
        { label: "Inspect translation key", value: "key" },
        { label: "Show where a key is used", value: "where" },
        { label: "Search translations by text", value: "search" },
        { label: "Inspect locale files", value: "locales" },
        { label: "View translation graph", value: "graph" }
      ]
    });

    if (isCancel(mode)) {
      cancel("Inspect cancelled.");
      return;
    }

    if (mode === "key") {
      const key = await text({
        message: "Translation key"
      });

      if (isCancel(key) || key.trim().length === 0) {
        cancel("Inspect cancelled.");
        return;
      }

      await executeInspectCommand(key.trim());
    }

    if (mode === "where") {
      const key = await text({
        message: "Translation key"
      });

      if (isCancel(key) || key.trim().length === 0) {
        cancel("Inspect cancelled.");
        return;
      }

      await executeWhereCommand(key.trim());
    }

    if (mode === "search") {
      const query = await text({
        message: "Search text"
      });

      if (isCancel(query) || query.trim().length === 0) {
        cancel("Search cancelled.");
        return;
      }

      await executeSearchCommand(query.trim());
    }

    if (mode === "locales") {
      const language = await text({
        message: "Language code"
      });
      const scope = await text({
        message: "Optional file or key scope",
        placeholder: "Leave blank for all entries"
      });

      if (isCancel(language) || language.trim().length === 0) {
        cancel("Locale inspection cancelled.");
        return;
      }

      await executeLocalesCommand(
        language.trim(),
        isCancel(scope) || scope.trim().length === 0 ? undefined : scope.trim()
      );
    }

    if (mode === "graph") {
      await executeGraphCommand();
    }
  }

  if (action === "classify") {
    await executeClassifyCommand();
  }

  outro("Done.");
}
