import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  buildGlobalUpdateInvocation,
  executeUpdateCommand
} from "../src/commands/update";
import {
  checkForCliUpdates,
  compareVersions,
  fetchUpdateReleaseInfo,
  getDefaultUpdateInstallSource,
  readCliUpdateState
} from "../src/update/versionCheck";

describe("update commands", () => {
  const originalFetch = globalThis.fetch;
  const originalStateDir = process.env.GLOBALYZE_CLI_STATE_DIR;
  const originalUpdateSource = process.env.GLOBALYZE_UPDATE_SOURCE;
  const originalInstallMode = process.env.GLOBALYZE_CLI_INSTALL_MODE;
  let tempStateDir: string;

  beforeEach(async () => {
    tempStateDir = await mkdtemp(path.join(tmpdir(), "globalyze-update-"));
    process.env.GLOBALYZE_CLI_STATE_DIR = tempStateDir;
    process.env.GLOBALYZE_CLI_INSTALL_MODE = "global";
    delete process.env.GLOBALYZE_UPDATE_SOURCE;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    if (originalStateDir === undefined) {
      delete process.env.GLOBALYZE_CLI_STATE_DIR;
    } else {
      process.env.GLOBALYZE_CLI_STATE_DIR = originalStateDir;
    }

    if (originalUpdateSource === undefined) {
      delete process.env.GLOBALYZE_UPDATE_SOURCE;
    } else {
      process.env.GLOBALYZE_UPDATE_SOURCE = originalUpdateSource;
    }

    if (originalInstallMode === undefined) {
      delete process.env.GLOBALYZE_CLI_INSTALL_MODE;
    } else {
      process.env.GLOBALYZE_CLI_INSTALL_MODE = originalInstallMode;
    }

    await rm(tempStateDir, { recursive: true, force: true });
  });

  it("compares semantic versions correctly", () => {
    expect(compareVersions("0.1.1", "0.1.0")).toBe(1);
    expect(compareVersions("0.1.0", "0.1.1")).toBe(-1);
    expect(compareVersions("1.2.0", "1.2.0")).toBe(0);
  });

  it("checks the remote version and caches the result", async () => {
    const fetchMock = mock((input: unknown) => {
      const url = String(input);
      if (url.includes("package.json")) {
        return new Response(JSON.stringify({ version: "0.2.0" }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      return new Response(
        JSON.stringify({
          name: "v0.2.0",
          html_url: "https://github.com/Bil0000/Globalyze/releases/tag/v0.2.0",
          body: "- Faster syncs\n- Better runtime wiring\n- More stable manifests"
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const first = await checkForCliUpdates("0.1.0", {
      now: 1_000
    });
    const second = await checkForCliUpdates("0.1.0", {
      now: 2_000
    });
    const state = await readCliUpdateState();

    expect(first.checked).toBe(true);
    expect(first.updateAvailable).toBe(true);
    expect(first.latestVersion).toBe("0.2.0");
    expect(second.checked).toBe(false);
    expect(second.latestVersion).toBe("0.2.0");
    expect(first.releaseInfo?.source).toBe("release");
    expect(first.releaseInfo?.summaryLines).toEqual([
      "Faster syncs",
      "Better runtime wiring",
      "More stable manifests"
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(state.latestVersion).toBe("0.2.0");
    expect(state.releaseInfo?.source).toBe("release");
  });

  it("supports check-only update mode without running install", async () => {
    globalThis.fetch = mock((input: unknown) => {
      const url = String(input);
      if (url.includes("package.json")) {
        return new Response(JSON.stringify({ version: "0.2.0" }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      return new Response("", {
        status: 404
      });
    }) as unknown as typeof fetch;

    const result = await executeUpdateCommand("0.1.0", {
      checkOnly: true
    });

    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe("0.2.0");
    expect(result.installSource).toBe("github:Bil0000/Globalyze");
    expect(result.installMode).toBe("global");
  });

  it("guides linked local checkouts to update the repo directly", async () => {
    process.env.GLOBALYZE_CLI_INSTALL_MODE = "linked";
    const fetchMock = mock(() => {
      throw new Error("fetch should not be called in linked mode");
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await executeUpdateCommand("0.1.0", {
      checkOnly: true
    });

    expect(result.installMode).toBe("linked");
    expect(result.checked).toBe(false);
    expect(result.updateAvailable).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to recent commit messages when no GitHub release exists", async () => {
    globalThis.fetch = mock((input: unknown) => {
      const url = String(input);
      if (url.includes("/releases/latest")) {
        return new Response("", { status: 404 });
      }

      return new Response(
        JSON.stringify([
          { commit: { message: "Improve sync performance\n\nMore details" } },
          { commit: { message: "Harden runtime wiring" } },
          { commit: { message: "Fix manifest refresh edge cases" } }
        ]),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }) as unknown as typeof fetch;

    const result = await fetchUpdateReleaseInfo();

    expect(result?.source).toBe("commits");
    expect(result?.summaryLines).toEqual([
      "Improve sync performance",
      "Harden runtime wiring",
      "Fix manifest refresh edge cases"
    ]);
  });

  it("builds the expected global update install command", () => {
    expect(buildGlobalUpdateInvocation("github:Bil0000/Globalyze")).toEqual({
      command: "bun",
      args: ["add", "-g", "github:Bil0000/Globalyze"],
      displayCommand: "bun add -g github:Bil0000/Globalyze"
    });
  });

  it("allows overriding the update source through environment", () => {
    process.env.GLOBALYZE_UPDATE_SOURCE = "github:Bil0000/Globalyze#main";
    expect(getDefaultUpdateInstallSource()).toBe("github:Bil0000/Globalyze#main");
  });
});
