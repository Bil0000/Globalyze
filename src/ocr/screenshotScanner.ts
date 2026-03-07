import { createWorker } from "tesseract.js";

import { readLocaleDictionary } from "../i18n/localeManager";
import type { OcrScanResult, ResolvedGlobalyzeConfig } from "../types";
import { GlobalyzeError } from "../utils/errors";

export interface OcrEngine {
  recognize(imagePath: string): Promise<{ data: { text: string } }>;
  terminate(): Promise<void>;
}

function normalizeDetectedText(value: string): string[] {
  return value
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 1)
    .filter((line) => /[\p{L}\p{N}]/u.test(line));
}

async function createDefaultEngine(): Promise<OcrEngine> {
  const worker = await createWorker("eng");

  return {
    async recognize(imagePath: string) {
      const result = await worker.recognize(imagePath);
      return {
        data: {
          text: result.data.text
        }
      };
    },
    async terminate() {
      await worker.terminate();
    }
  };
}

export async function scanScreenshotForUntranslatedText(
  imagePath: string,
  config: ResolvedGlobalyzeConfig,
  engine?: OcrEngine
): Promise<OcrScanResult> {
  const resolvedEngine = engine ?? (await createDefaultEngine());

  try {
    const localeDictionaries = await Promise.all(
      config.languages.map((language) => readLocaleDictionary(config, language))
    );
    const knownStrings = new Set(
      localeDictionaries.flatMap((locale) =>
        Object.values(locale).map((value) => value.trim().toLowerCase())
      )
    );
    const result = await resolvedEngine.recognize(imagePath);
    const detectedText = [...new Set(normalizeDetectedText(result.data.text))];
    const untranslatedText = detectedText.filter(
      (line) => !knownStrings.has(line.trim().toLowerCase())
    );

    return {
      detectedText,
      untranslatedText
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unknown OCR failure";

    throw new GlobalyzeError(`Failed to analyze screenshot ${imagePath}: ${reason}`);
  } finally {
    await resolvedEngine.terminate();
  }
}
