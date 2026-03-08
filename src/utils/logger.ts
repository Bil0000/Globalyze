import chalk from "chalk";
import logSymbols from "log-symbols";
import ora, { type Ora } from "ora";

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${String(milliseconds)}ms`;
  }

  const totalSeconds = milliseconds / 1000;

  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(totalSeconds >= 10 ? 0 : 1)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);

  if (minutes < 60) {
    return `${String(minutes)}m ${String(seconds)}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${String(hours)}h ${String(remainingMinutes)}m`;
}

export class Logger {
  newline(): void {
    console.log("");
  }

  heading(message: string): void {
    console.log(chalk.bold(message));
  }

  start(message: string): Ora {
    return ora({
      text: message,
      color: "cyan"
    }).start();
  }

  async step<T>(
    message: string,
    task: () => Promise<T>,
    successMessage?: string | ((result: T) => string)
  ): Promise<T> {
    const spinner = this.start(message);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      spinner.text = `${message} (${formatDuration(Date.now() - startedAt)} elapsed)`;
    }, 1000);

    try {
      const result = await task();
      const finalMessage =
        typeof successMessage === "function"
          ? successMessage(result)
          : successMessage ?? message;
      spinner.succeed(
        `${finalMessage} ${chalk.dim(`(completed in ${formatDuration(Date.now() - startedAt)})`)}`
      );
      return result;
    } catch (error) {
      spinner.fail(
        `${message} ${chalk.dim(`(failed after ${formatDuration(Date.now() - startedAt)})`)}`
      );
      throw error;
    } finally {
      clearInterval(timer);
    }
  }

  info(message: string): void {
    console.log(`${chalk.cyan(logSymbols.info)} ${message}`);
  }

  hint(message: string): void {
    console.log(`${chalk.blue(logSymbols.info)} ${chalk.dim(message)}`);
  }

  success(message: string): void {
    console.log(`${chalk.green(logSymbols.success)} ${message}`);
  }

  warn(message: string): void {
    console.warn(`${chalk.yellow(logSymbols.warning)} ${message}`);
  }

  error(message: string): void {
    console.error(`${chalk.red(logSymbols.error)} ${message}`);
  }

  list(items: readonly string[]): void {
    for (const item of items) {
      console.log(`  ${chalk.gray("•")} ${item}`);
    }
  }
}

export const logger = new Logger();
