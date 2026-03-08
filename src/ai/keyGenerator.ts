import OpenAI from "openai";

import type {
  ExtractedString,
  KeyAssignment,
  KeyGenerationCandidate,
  KeyGenerationResult,
  LocaleDictionary
} from "../types";
import { findSimilarExistingKey } from "./keySimilarity";
import { toPosixPath } from "../utils/fileUtils";

const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite";
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

interface OpenAIKeyGenerationClient {
  responses: {
    create(input: {
      model: string;
      input: string;
    }): Promise<{
      output_text: string;
    }>;
  };
}

const GENERIC_FILE_SEGMENTS = new Set([
  "src",
  "app",
  "pages",
  "page",
  "index",
  "components",
  "component",
  "layout",
  "ui"
]);

function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function sanitizeKey(value: string): string | null {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/-/g, "_")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");

  if (!normalized) {
    return null;
  }

  const segments = normalized
    .split(".")
    .map((segment) => slugifySegment(segment))
    .filter(Boolean)
    .slice(0, 4);

  if (segments.length === 0) {
    return null;
  }

  return segments.join(".");
}

function makeUniqueKey(
  candidateKey: string,
  text: string,
  assignedKeys: Map<string, string>
): string {
  const existingEntry = [...assignedKeys.entries()].find(
    ([, key]) => key === candidateKey
  );

  if (!existingEntry) {
    return candidateKey;
  }

  if (existingEntry[0] === text) {
    return candidateKey;
  }

  const segments = candidateKey.split(".");
  const lastSegment = segments.pop() ?? candidateKey;
  let suffix = 2;

  for (;;) {
    const nextKey = [...segments, `${lastSegment}_${String(suffix)}`].join(".");
    const conflict = [...assignedKeys.values()].includes(nextKey);

    if (!conflict) {
      return nextKey;
    }

    suffix += 1;
  }
}

function createFallbackKey(candidate: KeyGenerationCandidate): string {
  const contextualSegments = [
    candidate.pageName ? slugifySegment(candidate.pageName) : "",
    candidate.componentName ? slugifySegment(candidate.componentName) : "",
    candidate.elementType ? slugifySegment(candidate.elementType) : ""
  ].filter(Boolean);
  const normalizedPathSegments = toPosixPath(candidate.file)
    .split("/")
    .map((segment) => segment.replace(/\.[^.]+$/, ""))
    .map((segment) => slugifySegment(segment))
    .filter(Boolean);
  const trimmedPathSegments = [...normalizedPathSegments];

  while (
    trimmedPathSegments.length > 0 &&
    GENERIC_FILE_SEGMENTS.has(trimmedPathSegments.at(-1) ?? "")
  ) {
    trimmedPathSegments.pop();
  }

  const lastGenericIndex = trimmedPathSegments.reduce(
    (currentIndex, segment, index) =>
      GENERIC_FILE_SEGMENTS.has(segment) ? index : currentIndex,
    -1
  );
  const pathTail =
    lastGenericIndex >= 0
      ? trimmedPathSegments.slice(lastGenericIndex + 1)
      : trimmedPathSegments.slice(-2);
  const contextSegments = pathTail
    .filter((segment) => !GENERIC_FILE_SEGMENTS.has(segment))
    .slice(-2);
  const textSlug = slugifySegment(candidate.text).slice(0, 40) || "label";
  const keySegments = [...contextualSegments, ...contextSegments, textSlug]
    .filter(Boolean)
    .slice(-4);

  if (keySegments.length === 0) {
    return "common.label";
  }

  if (keySegments.length === 1) {
    const onlySegment = keySegments[0];

    if (!onlySegment) {
      return "common.label";
    }

    return `common.${onlySegment}`;
  }

  return keySegments.join(".");
}

function buildPrompt(batch: readonly KeyGenerationCandidate[]): string {
  const rows = batch
    .map(
      (item, index) =>
        [
          `${String(index + 1)}. file: ${toPosixPath(item.file)}`,
          `text: ${item.text}`,
          item.componentName ? `component: ${item.componentName}` : "",
          item.pageName ? `page: ${item.pageName}` : "",
          item.elementType ? `element: ${item.elementType}` : ""
        ]
          .filter(Boolean)
          .join("\n")
    )
    .join("\n\n");

  return [
    "Generate a short semantic i18n key for each UI string.",
    "",
    "Rules:",
    "- lowercase",
    "- dot separated",
    "- max 4 segments",
    "- no spaces",
    "- no punctuation except dots and underscores",
    "- keep keys semantic and concise",
    "- do not wrap the response in markdown fences or explanations",
    "",
    'Return strict JSON as {"items":[{"text":"...","key":"..."}]}.',
    "",
    rows
  ].join("\n");
}

function extractJsonObject(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  const fencedMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function parseResponse(output: string): Map<string, string> {
  const parsed = JSON.parse(extractJsonObject(output)) as unknown;
  const mappings = new Map<string, string>();

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("items" in parsed) ||
    !Array.isArray(parsed.items)
  ) {
    return mappings;
  }

  const items = parsed.items as unknown[];

  for (const item of items) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const candidate = item as { text?: unknown; key?: unknown };

    if (typeof candidate.text === "string" && typeof candidate.key === "string") {
      mappings.set(candidate.text, candidate.key);
    }
  }

  return mappings;
}

function dedupeCandidates(
  strings: readonly ExtractedString[]
): KeyGenerationCandidate[] {
  const seen = new Set<string>();
  const candidates: KeyGenerationCandidate[] = [];

  for (const item of strings) {
    if (seen.has(item.text)) {
      continue;
    }

    seen.add(item.text);
    candidates.push({
      text: item.text,
      file: item.file,
      componentName: item.componentName,
      pageName: item.pageName,
      pageNames: item.pageNames,
      elementType: item.elementType
    });
  }

  return candidates;
}

async function generateBatchWithOpenAI(
  client: OpenAIKeyGenerationClient,
  model: string,
  batch: readonly KeyGenerationCandidate[]
): Promise<Map<string, string>> {
  const response = await client.responses.create({
    model,
    input: buildPrompt(batch)
  });

  return parseResponse(response.output_text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }

  const status = error.status;

  return typeof status === "number" ? status : null;
}

function isRateLimitError(error: unknown): boolean {
  return getErrorStatus(error) === 429;
}

function normalizeErrorMessage(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractRetryDelay(value: string): string | null {
  const retryMatch =
    /retry in ([0-9]+(?:\.[0-9]+)?s)/i.exec(value) ??
    /retryDelay["']?\s*:\s*["']([^"']+)["']/i.exec(value);

  return retryMatch?.[1] ?? null;
}

function summarizeProviderError(provider: string, error: unknown): string {
  const rawMessage =
    error instanceof Error ? normalizeErrorMessage(error.message) : "Unknown error";
  const rateLimited =
    isRateLimitError(error) ||
    /quota exceeded|rate limit|resource_exhausted|too many requests/i.test(
      rawMessage
    );

  if (rateLimited) {
    const retryDelay = extractRetryDelay(rawMessage);
    return `${provider} rate limit reached. Check quota or billing${retryDelay ? ` and retry in about ${retryDelay}` : " and try again later"}.`;
  }

  const firstSentence = rawMessage.split(/(?<=[.?!])\s+/)[0] ?? rawMessage;
  return firstSentence.slice(0, 220);
}

function extractGeminiText(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }

  const candidatesValue = value.candidates;

  if (!Array.isArray(candidatesValue)) {
    return "";
  }

  const candidate: unknown = candidatesValue[0];

  if (!isRecord(candidate) || !isRecord(candidate.content)) {
    return "";
  }

  const partsValue = candidate.content.parts;

  if (!Array.isArray(partsValue)) {
    return "";
  }

  return partsValue
    .map((part) => {
      if (!isRecord(part)) {
        return "";
      }

      return typeof part.text === "string" ? part.text : "";
    })
    .join("")
    .trim();
}

async function generateBatchWithGemini(
  apiKey: string,
  model: string,
  batch: readonly KeyGenerationCandidate[],
  fetchImpl: typeof fetch = fetch
): Promise<Map<string, string>> {
  const response = await fetchImpl(
    `${GEMINI_API_URL}/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: buildPrompt(batch)
              }
            ]
          }
        ]
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();
    const status = response.status;
    const error = new Error(
      `Gemini API request failed with status ${String(status)}${details ? `: ${details}` : ""}`
    ) as Error & { status?: number };
    error.status = status;
    throw error;
  }

  const payload: unknown = await response.json();
  return parseResponse(extractGeminiText(payload));
}

export async function generateSemanticKeys(
  strings: readonly ExtractedString[],
  options: {
    apiKey?: string;
    model?: string;
    geminiModel?: string;
    batchSize?: number;
    existingLocale?: LocaleDictionary;
    openAIClient?: OpenAIKeyGenerationClient;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<KeyGenerationResult> {
  const candidates = dedupeCandidates(strings);
  const keysByText = new Map<string, string>();
  const existingLocale = options.existingLocale ?? {};
  const reservedKeys = new Set<string>();
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const model = options.model ?? "gpt-4o-mini";
  const geminiModel = options.geminiModel ?? GEMINI_FALLBACK_MODEL;
  const batchSize = options.batchSize ?? 20;
  let usedFallback = false;
  let fallbackReason: string | undefined;
  let reusedExistingKeys = 0;
  const pendingCandidates: KeyGenerationCandidate[] = [];

  const assignCandidate = (
    candidate: KeyGenerationCandidate,
    generatedKey: string | null
  ) => {
    const baseKey = sanitizeKey(generatedKey ?? "") ?? createFallbackKey(candidate);
    if (generatedKey === null || sanitizeKey(generatedKey) === null) {
      usedFallback = true;
    }
    const uniqueKey = makeUniqueKey(baseKey, candidate.text, keysByText);
    keysByText.set(candidate.text, uniqueKey);
    reservedKeys.add(uniqueKey);
  };

  for (const candidate of candidates) {
    const exactMatch = Object.entries(existingLocale).find(
      ([key, value]) => value === candidate.text && !reservedKeys.has(key)
    );

    if (exactMatch) {
      keysByText.set(candidate.text, exactMatch[0]);
      reservedKeys.add(exactMatch[0]);
      reusedExistingKeys += 1;
      continue;
    }

    const similarMatch = findSimilarExistingKey(
      candidate.text,
      existingLocale,
      reservedKeys
    );

    if (similarMatch) {
      keysByText.set(candidate.text, similarMatch.key);
      reservedKeys.add(similarMatch.key);
      reusedExistingKeys += 1;
      continue;
    }

    pendingCandidates.push(candidate);
  }

  if (!apiKey) {
    usedFallback = true;
    fallbackReason =
      "OPENAI_API_KEY is not set, so deterministic fallback keys were used.";

    for (const candidate of pendingCandidates) {
      assignCandidate(candidate, null);
    }

    return {
      keysByText,
      usedFallback,
      fallbackReason,
      reusedExistingKeys
    };
  }

  const client =
    options.openAIClient ?? (new OpenAI({ apiKey }) as OpenAIKeyGenerationClient);

  for (let index = 0; index < pendingCandidates.length; index += batchSize) {
    const batch = pendingCandidates.slice(index, index + batchSize);

    try {
      const generated = await generateBatchWithOpenAI(client, model, batch);

      if (generated.size === 0 && batch.length > 0) {
        usedFallback = true;
        fallbackReason =
          "OpenAI returned an invalid key payload, so deterministic fallback keys were used.";
      }

      for (const candidate of batch) {
        assignCandidate(candidate, generated.get(candidate.text) ?? null);
      }
    } catch (error) {
      if (isRateLimitError(error) && geminiApiKey) {
        try {
          const generated = await generateBatchWithGemini(
            geminiApiKey,
            geminiModel,
            batch,
            options.fetchImpl
          );

          if (generated.size === 0 && batch.length > 0) {
            usedFallback = true;
            fallbackReason =
              "OpenAI rate limits were reached, Gemini returned an invalid key payload, and deterministic fallback keys were used.";
          }

          for (const candidate of batch) {
            assignCandidate(candidate, generated.get(candidate.text) ?? null);
          }

          continue;
        } catch (geminiError) {
          usedFallback = true;
          const openAiReason = summarizeProviderError("OpenAI", error);
          const geminiReason = summarizeProviderError("Gemini", geminiError);

          fallbackReason = `${openAiReason} Gemini fallback also failed: ${geminiReason} Deterministic fallback keys were used for this run.`;

          for (const candidate of batch) {
            assignCandidate(candidate, null);
          }

          continue;
        }
      }

      usedFallback = true;
      const reason = summarizeProviderError("OpenAI", error);

      fallbackReason = isRateLimitError(error) && !geminiApiKey
        ? `${reason} GEMINI_API_KEY is not set, so deterministic fallback keys were used.`
        : `OpenAI key generation failed: ${reason} Deterministic fallback keys were used.`;

      for (const candidate of batch) {
        assignCandidate(candidate, null);
      }
    }
  }

  return {
    keysByText,
    usedFallback,
    reusedExistingKeys,
    ...(fallbackReason ? { fallbackReason } : {})
  };
}

export function createKeyAssignments(
  strings: readonly ExtractedString[],
  keysByText: ReadonlyMap<string, string>
): KeyAssignment[] {
  const uniqueTexts = new Set<string>();
  const assignments: KeyAssignment[] = [];

  for (const item of strings) {
    if (uniqueTexts.has(item.text)) {
      continue;
    }

    uniqueTexts.add(item.text);
    assignments.push({
      text: item.text,
      file: toPosixPath(item.file),
      key: keysByText.get(item.text) ?? createFallbackKey(item),
      componentName: item.componentName,
      pageName: item.pageName,
      pageNames: item.pageNames,
      elementType: item.elementType
    });
  }

  return assignments.sort((left, right) => left.key.localeCompare(right.key));
}
