import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  assertGovernanceAllowsChanges,
  evaluateTranslationGovernance
} from "../src/governance/translationGovernance";
import {
  readLocaleEntries,
  writeLocaleEntries
} from "../src/i18n/localeManager";
import { updateTranslationGraph } from "../src/graph/translationGraph";
import { createTestConfig } from "./testUtils";

describe("translation governance", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  it("evaluates locked and approval-required changes", () => {
    const evaluation = evaluateTranslationGovernance(
      {
        "checkout.pay_button": {
          value: "Pay now",
          owner: "payments-team",
          locked: true,
          approvalRequired: true
        }
      },
      {
        "checkout.pay_button": {
          value: "Pay now!",
          owner: "payments-team",
          locked: true,
          approvalRequired: true
        }
      }
    );

    expect(evaluation.changedKeys).toHaveLength(1);
    expect(evaluation.lockedViolations).toHaveLength(1);
    expect(evaluation.approvalRequiredChanges).toHaveLength(1);
    expect(evaluation.ownedChanges).toHaveLength(1);
  });

  it("throws when locked changes are configured to fail", () => {
    expect(() => {
      assertGovernanceAllowsChanges(
        createTestConfig("/tmp/globalyze", {
          governance: {
            enabled: true,
            failOnLockedChange: true,
            failOnApprovalRequiredChange: false
          }
        }),
        {
          changedKeys: [
            {
              key: "checkout.pay_button",
              previousValue: "Pay now",
              nextValue: "Pay now!",
              locked: true
            }
          ],
          lockedViolations: [
            {
              key: "checkout.pay_button",
              previousValue: "Pay now",
              nextValue: "Pay now!",
              locked: true
            }
          ],
          approvalRequiredChanges: [],
          ownedChanges: []
        }
      );
    }).toThrow("Locked translation keys were modified");
  });

  it("persists metadata in every locale structure", async () => {
    const structures = [
      { format: "json", structure: "single" },
      { format: "json", structure: "multiple" },
      { format: "js", structure: "single" },
      { format: "js", structure: "multiple" }
    ] as const;

    for (const structure of structures) {
      const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-governance-"));
      tempDirectories.push(rootDir);
      await mkdir(path.join(rootDir, "src"), { recursive: true });
      const config = createTestConfig(rootDir, {
        localeStructure: {
          ...createTestConfig(rootDir).localeStructure,
          format: structure.format,
          structure: structure.structure,
          commonFile: structure.structure === "multiple"
        }
      });

      await writeLocaleEntries(config, "en", {
        "checkout.pay_button": {
          value: "Pay now",
          owner: "payments-team",
          locked: true,
          approvalRequired: true
        }
      });

      const entries = await readLocaleEntries(config, "en");
      expect(entries["checkout.pay_button"]).toEqual({
        value: "Pay now",
        owner: "payments-team",
        locked: true,
        approvalRequired: true
      });
    }
  });

  it("stores governance metadata in the translation graph", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-governance-"));
    tempDirectories.push(rootDir);
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    const config = createTestConfig(rootDir);

    await writeLocaleEntries(config, "en", {
      "checkout.pay_button": {
        value: "Pay now",
        owner: "payments-team",
        locked: false,
        approvalRequired: true
      }
    });

    const graph = await updateTranslationGraph(config, [
      {
        key: "checkout.pay_button",
        file: path.join(rootDir, "src", "CheckoutButton.tsx")
      }
    ]);

    expect(graph["checkout.pay_button"]).toMatchObject({
      owner: "payments-team",
      approvalRequired: true
    });
  });
});
