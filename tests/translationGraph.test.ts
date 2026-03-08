import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { updateTranslationGraph } from "../src/graph/translationGraph";
import { syncLocaleFiles } from "../src/i18n/localeManager";
import { createTestConfig } from "./testUtils";

describe("translationGraph", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  it("tracks origin files, locale files, and usages", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-graph-"));
    tempDirectories.push(rootDir);
    const config = createTestConfig(rootDir);
    await syncLocaleFiles(config, {
      "checkout.pay_button": "Pay now"
    });

    const graph = await updateTranslationGraph(config, [
      {
        key: "checkout.pay_button",
        file: path.join(rootDir, "src", "components", "CheckoutButton.tsx")
      },
      {
        key: "checkout.pay_button",
        file: path.join(rootDir, "src", "components", "MobileCheckout.tsx")
      }
    ]);

    expect(graph["checkout.pay_button"]?.text).toBe("Pay now");
    expect(graph["checkout.pay_button"]?.localeFile).toBe("en.json");
    expect(graph["checkout.pay_button"]?.usages.length).toBe(2);
  });

  it("only stores keys that have real source usages", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-graph-"));
    tempDirectories.push(rootDir);
    const config = createTestConfig(rootDir);
    await syncLocaleFiles(config, {
      "checkout.pay_button": "Pay now",
      "checkout.unused": "Unused"
    });

    const graph = await updateTranslationGraph(config, [
      {
        key: "checkout.pay_button",
        file: path.join(rootDir, "src", "components", "CheckoutButton.tsx")
      }
    ]);

    expect(graph["checkout.pay_button"]?.originFile).toBe(
      "src/components/CheckoutButton.tsx"
    );
    expect(graph["checkout.unused"]).toBeUndefined();
  });
});
