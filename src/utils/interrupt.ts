import { logger } from "./logger";

let interruptInstalled = false;
let isInterrupting = false;

function shutdownFromInterrupt(): void {
  if (isInterrupting) {
    return;
  }

  isInterrupting = true;
  logger.warn("Interrupted. Stopping Globalyze.");
  process.exit(130);
}

export function installInterruptHandler(): void {
  if (interruptInstalled) {
    return;
  }

  interruptInstalled = true;

  process.on("SIGINT", shutdownFromInterrupt);
  process.on("SIGTERM", shutdownFromInterrupt);
}
