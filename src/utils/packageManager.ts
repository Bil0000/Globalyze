import path from "node:path";
import { spawn } from "node:child_process";

import type { DetectedPackageManager, PackageManagerName } from "../types";

const PACKAGE_MANAGER_FILES: readonly [string, PackageManagerName][] = [
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"]
];

function buildInstallCommand(name: PackageManagerName): string {
  switch (name) {
    case "bun":
      return "bun add";
    case "pnpm":
      return "pnpm add";
    case "yarn":
      return "yarn add";
    default:
      return "npm install";
  }
}

export async function detectPackageManager(
  rootDir: string
): Promise<DetectedPackageManager> {
  for (const [fileName, name] of PACKAGE_MANAGER_FILES) {
    if (await Bun.file(path.join(rootDir, fileName)).exists()) {
      return {
        name,
        installCommand: buildInstallCommand(name)
      };
    }
  }

  return {
    name: "npm",
    installCommand: buildInstallCommand("npm")
  };
}

export function buildPackageInstallInvocation(
  packageManager: DetectedPackageManager,
  packages: readonly string[]
): { command: string; args: string[]; displayCommand: string } {
  const args =
    packageManager.name === "npm"
      ? ["install", ...packages]
      : ["add", ...packages];

  return {
    command: packageManager.name,
    args,
    displayCommand: `${packageManager.installCommand} ${packages.join(" ")}`
  };
}

export async function installPackages(
  packageManager: DetectedPackageManager,
  packages: readonly string[],
  cwd: string
): Promise<void> {
  const invocation = buildPackageInstallInvocation(packageManager, packages);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      stdio: "inherit",
      shell: false
    });

    child.on("error", (error) => {
      reject(error);
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Package installation failed with exit code ${String(code ?? "unknown")}.`
        )
      );
    });
  });
}
