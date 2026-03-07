import chalk from "chalk";
import logSymbols from "log-symbols";
import ora, { type Ora } from "ora";

export class Logger {
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

    try {
      const result = await task();
      const finalMessage =
        typeof successMessage === "function"
          ? successMessage(result)
          : successMessage ?? message;
      spinner.succeed(finalMessage);
      return result;
    } catch (error) {
      spinner.fail(message);
      throw error;
    }
  }

  info(message: string): void {
    console.log(`${chalk.cyan(logSymbols.info)} ${message}`);
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
