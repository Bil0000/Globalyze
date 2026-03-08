import type {
  GovernanceChange,
  GovernanceEvaluationResult,
  LocaleEntryDictionary,
  ResolvedGlobalyzeConfig
} from "../types";
import { GlobalyzeError } from "../utils/errors";

export function evaluateTranslationGovernance(
  currentSource: LocaleEntryDictionary,
  nextSource: LocaleEntryDictionary
): GovernanceEvaluationResult {
  const changedKeys: GovernanceChange[] = [];

  for (const [key, nextEntry] of Object.entries(nextSource)) {
    const currentEntry = currentSource[key];

    if (!currentEntry || currentEntry.value === nextEntry.value) {
      continue;
    }

    changedKeys.push({
      key,
      previousValue: currentEntry.value,
      nextValue: nextEntry.value,
      owner: currentEntry.owner,
      locked: currentEntry.locked,
      approvalRequired: currentEntry.approvalRequired
    });
  }

  return {
    changedKeys,
    lockedViolations: changedKeys.filter((item) => item.locked),
    approvalRequiredChanges: changedKeys.filter((item) => item.approvalRequired),
    ownedChanges: changedKeys.filter((item) => typeof item.owner === "string")
  };
}

export function assertGovernanceAllowsChanges(
  config: ResolvedGlobalyzeConfig,
  evaluation: GovernanceEvaluationResult
): void {
  if (!config.governance.enabled) {
    return;
  }

  if (
    config.governance.failOnLockedChange &&
    evaluation.lockedViolations.length > 0
  ) {
    throw new GlobalyzeError(
      `Locked translation keys were modified: ${evaluation.lockedViolations
        .map((item) => item.key)
        .join(", ")}`
    );
  }

  if (
    config.governance.failOnApprovalRequiredChange &&
    evaluation.approvalRequiredChanges.length > 0
  ) {
    throw new GlobalyzeError(
      `Approval-required translation keys were modified: ${evaluation.approvalRequiredChanges
        .map((item) => item.key)
        .join(", ")}`
    );
  }
}
