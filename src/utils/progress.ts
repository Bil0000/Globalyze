import { logger } from "./logger";

export function logInterruptHint(): void {
  logger.hint("Press Ctrl+C at any time to stop Globalyze safely.");
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
