import os from "node:os";

export type ConcurrencyProfile = "cpu" | "io" | "network";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getResourceFriendlyConcurrency(
  profile: ConcurrencyProfile
): number {
  const configured = Number.parseInt(
    process.env.GLOBALYZE_MAX_CONCURRENCY ?? "",
    10
  );

  if (Number.isFinite(configured) && configured > 0) {
    return clamp(configured, 1, 8);
  }

  const available =
    typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : os.cpus().length;
  const memoryInGiB = Math.floor(os.totalmem() / (1024 * 1024 * 1024));
  const lowMemory = memoryInGiB > 0 && memoryInGiB <= 8;
  const veryLowMemory = memoryInGiB > 0 && memoryInGiB <= 4;

  if (profile === "network") {
    return clamp(
      Math.floor(available / (veryLowMemory ? 6 : lowMemory ? 5 : 4)),
      1,
      lowMemory ? 2 : 3
    );
  }

  if (profile === "cpu") {
    return clamp(
      Math.floor(available / (veryLowMemory ? 4 : lowMemory ? 3 : 2)),
      1,
      lowMemory ? 3 : 4
    );
  }

  return clamp(
    Math.floor((available * (lowMemory ? 2 : 3)) / 4),
    2,
    lowMemory ? 4 : 6
  );
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
