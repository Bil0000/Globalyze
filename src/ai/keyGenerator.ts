import OpenAI from "openai";

import type {
  ExtractedString,
  KeyAssignment,
  KeyGenerationCandidate,
  KeyGenerationResult
} from "../types";
import { toPosixPath } from "../utils/fileUtils";

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
  const keySegments = [...contextSegments, textSlug]
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
        `${String(index + 1)}. file: ${toPosixPath(item.file)}\ntext: ${item.text}`
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
    "",
    'Return strict JSON as {"items":[{"text":"...","key":"..."}]}.',
    "",
    rows
  ].join("\n");
}

function parseResponse(output: string): Map<string, string> {
  const parsed = JSON.parse(output) as unknown;
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
      file: item.file
    });
  }

  return candidates;
}

async function generateBatchWithOpenAI(
  client: OpenAI,
  model: string,
  batch: readonly KeyGenerationCandidate[]
): Promise<Map<string, string>> {
  const response = await client.responses.create({
    model,
    input: buildPrompt(batch)
  });

  return parseResponse(response.output_text);
}

export async function generateSemanticKeys(
  strings: readonly ExtractedString[],
  options: {
    apiKey?: string;
    model?: string;
    batchSize?: number;
  } = {}
): Promise<KeyGenerationResult> {
  const candidates = dedupeCandidates(strings);
  const keysByText = new Map<string, string>();
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const model = options.model ?? "gpt-4o-mini";
  const batchSize = options.batchSize ?? 20;
  let usedFallback = false;

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
  };

  if (!apiKey) {
    usedFallback = true;

    for (const candidate of candidates) {
      assignCandidate(candidate, null);
    }

    return {
      keysByText,
      usedFallback
    };
  }

  const client = new OpenAI({ apiKey });

  for (let index = 0; index < candidates.length; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize);

    try {
      const generated = await generateBatchWithOpenAI(client, model, batch);

      for (const candidate of batch) {
        assignCandidate(candidate, generated.get(candidate.text) ?? null);
      }
    } catch {
      usedFallback = true;

      for (const candidate of batch) {
        assignCandidate(candidate, null);
      }
    }
  }

  return {
    keysByText,
    usedFallback
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
      key: keysByText.get(item.text) ?? createFallbackKey(item)
    });
  }

  return assignments.sort((left, right) => left.key.localeCompare(right.key));
}
