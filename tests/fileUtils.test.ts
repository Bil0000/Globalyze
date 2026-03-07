import path from "node:path";
import { describe, expect, it } from "bun:test";

import { resolveGlobalyzeRootDir } from "../src/utils/fileUtils";

describe("resolveGlobalyzeRootDir", () => {
  it("resolves the package root directory", () => {
    expect(resolveGlobalyzeRootDir()).toBe(
      path.resolve("/Users/bilal/Documents/globalyze")
    );
  });
});
