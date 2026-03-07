import levenshtein from "fast-levenshtein";

import type { LocaleDictionary } from "../types";

function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildTokenSet(value: string): Set<string> {
  return new Set(
    normalizeForComparison(value)
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean)
  );
}

function isTokenSubset(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size === 0 || right.size === 0) {
    return false;
  }

  const smaller = left.size <= right.size ? left : right;
  const larger = left.size <= right.size ? right : left;

  for (const token of smaller) {
    if (!larger.has(token)) {
      return false;
    }
  }

  return true;
}

export function calculateSimilarityScore(left: string, right: string): number {
  const normalizedLeft = normalizeForComparison(left);
  const normalizedRight = normalizeForComparison(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const distance = levenshtein.get(normalizedLeft, normalizedRight);
  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);

  if (maxLength === 0) {
    return 1;
  }

  const distanceScore = 1 - distance / maxLength;
  const leftTokens = buildTokenSet(normalizedLeft);
  const rightTokens = buildTokenSet(normalizedRight);
  const sharedTokens = [...leftTokens].filter((token) => rightTokens.has(token));
  const tokenScore =
    Math.max(leftTokens.size, rightTokens.size) === 0
      ? 0
      : sharedTokens.length / Math.max(leftTokens.size, rightTokens.size);

  if (
    (normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft) ||
      isTokenSubset(leftTokens, rightTokens)) &&
    Math.min(normalizedLeft.length, normalizedRight.length) >=
      Math.max(normalizedLeft.length, normalizedRight.length) / 2
  ) {
    return Math.max(distanceScore, tokenScore, 0.85);
  }

  return Math.max(distanceScore, tokenScore);
}

export function findSimilarExistingKey(
  text: string,
  locale: LocaleDictionary,
  reservedKeys: ReadonlySet<string>,
  threshold = 0.8
): { key: string; score: number } | null {
  let bestMatch: { key: string; score: number } | null = null;

  for (const [key, value] of Object.entries(locale)) {
    if (reservedKeys.has(key)) {
      continue;
    }

    const score = calculateSimilarityScore(text, value);

    if (score < threshold) {
      continue;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        key,
        score
      };
    }
  }

  return bestMatch;
}
