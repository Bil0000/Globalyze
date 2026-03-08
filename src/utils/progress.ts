import { logger } from "./logger";

export function logInterruptHint(): void {
  logger.hint("Press Ctrl+C at any time to stop Globalyze safely.");
}

export function logAnalysisHint(): void {
  logger.hint(
    "Scanning, extraction, and AI key planning can take longer on large projects."
  );
}

export function logTranslationHint(): void {
  logger.hint(
    "Translation can take longer with many keys, many languages, or low cache reuse."
  );
}

export function logMigrationHint(): void {
  logger.hint(
    "First-time migration can take longer because both source files and locale output may change."
  );
}

export function logFallbackReason(reason?: string): void {
  if (reason) {
    logger.warn(reason);
  }
}

export function logReusedKeyCount(count: number): void {
  if (count > 0) {
    logger.info(
      `Reused ${String(count)} existing translation key${
        count === 1 ? "" : "s"
      } based on similar source strings`
    );
  }
}
