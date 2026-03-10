import { describe, expect, it } from "bun:test";

import { extractStringsFromSource } from "../src/extractor/stringExtractor";

describe("extractStringsFromSource", () => {
  it("extracts sidebar and tab labels from UI config objects", () => {
    const source = [
      "const sidebarItems = [",
      '  { title: "Dashboard", href: "/dashboard" },',
      '  { label: "Analytics", value: "analytics" }',
      "];",
      ""
    ].join("\n");

    const extracted = extractStringsFromSource(
      source,
      "/tmp/demo/src/app/dashboard/page.tsx"
    );

    expect(extracted.map((entry) => entry.text)).toEqual([
      "Dashboard",
      "Analytics"
    ]);
    expect(extracted.map((entry) => entry.kind)).toEqual([
      "object-property",
      "object-property"
    ]);
    expect(extracted.map((entry) => entry.propertyName)).toEqual([
      "title",
      "label"
    ]);
  });

  it("extracts field descriptions and hints from object properties", () => {
    const source = [
      "const fields = [",
      '  { name: "email", label: "Email", description: "Work email", hint: "We never share it" }',
      "];",
      ""
    ].join("\n");

    const extracted = extractStringsFromSource(
      source,
      "/tmp/demo/src/components/ProfileForm.tsx"
    );

    expect(extracted.map((entry) => entry.text)).toEqual([
      "Email",
      "Work email",
      "We never share it"
    ]);
  });
});
