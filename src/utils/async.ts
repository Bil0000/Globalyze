import os from "node:os";

export type ConcurrencyProfile = "cpu" | "io" | "network";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getResourceFriendlyConcurrency(
  profile: ConcurrencyProfile
): number {
  const available =
    typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : os.cpus().length;

  if (profile === "network") {
    return clamp(Math.floor(available / 4), 1, 3);
  }

  if (profile === "cpu") {
    return clamp(Math.floor(available / 2), 1, 4);
  }

  return clamp(Math.floor((available * 3) / 4), 2, 6);
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = clamp(concurrency, 1, Math.max(1, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await mapper(items[currentIndex] as T, currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: limit }, () => worker())
  );

  return results;
}
