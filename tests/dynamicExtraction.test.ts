import { describe, expect, it } from "bun:test";

import { extractDynamicStringsFromSource } from "../src/extractor/dynamicExtractor";
import { transformSource } from "../src/transformer/astTransformer";
import { createTestConfig } from "./testUtils";

describe("dynamic extraction", () => {
  it("extracts interpolated JSX strings into templates", () => {
    const source = [
      "export default function Activity({ user, itemCount }) {",
      "  return <h1>{`${user.name} added ${itemCount} items`}</h1>;",
      "}",
      ""
    ].join("\n");

    const extracted = extractDynamicStringsFromSource(
      source,
      "/tmp/demo/src/app/activity/page.tsx"
    );

    expect(extracted[0]?.template).toBe("{name} added {itemCount} items");
  });

  it("rewrites dynamic expressions into translation calls", () => {
    const source = [
      "export default function Activity({ user, itemCount }) {",
      "  return <h1>{`${user.name} added ${itemCount} items`}</h1>;",
      "}",
      ""
    ].join("\n");
    const config = createTestConfig("/tmp/demo");
    const result = transformSource(
      "/tmp/demo/src/app/activity/page.tsx",
      source,
      new Map([["{name} added {itemCount} items", "activity.items_added"]]),
      config
    );

    expect(result.code).toContain('t("activity.items_added", {');
  });
});
