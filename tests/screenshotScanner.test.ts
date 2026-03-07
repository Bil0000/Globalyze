import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { writeLocaleDictionary } from "../src/i18n/localeManager";
import {
  scanScreenshotForUntranslatedText,
  type OcrEngine
} from "../src/ocr/screenshotScanner";
import { createTestConfig } from "./testUtils";

describe("scanScreenshotForUntranslatedText", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
  });

  it("flags OCR text that is missing from the source locale", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-ocr-"));
    tempDirectories.push(rootDir);

    const config = createTestConfig(rootDir);
    await writeLocaleDictionary(config, "en", {
      "checkout.buy_button": "Buy now"
    });

    const engine: OcrEngine = {
      recognize() {
        return Promise.resolve({
          data: {
            text: "Buy now\nStart free trial"
          }
        });
      },
      terminate() {
        return Promise.resolve();
      }
    };

    const result = await scanScreenshotForUntranslatedText(
      path.join(rootDir, "ui.png"),
      config,
      engine
    );

    expect(result.detectedText).toEqual(["Buy now", "Start free trial"]);
    expect(result.untranslatedText).toEqual(["Start free trial"]);
  });
});
