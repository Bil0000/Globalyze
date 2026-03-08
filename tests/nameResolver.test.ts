import { describe, expect, it } from "bun:test";

import {
  resolveComponentName,
  resolveNameMetadata,
  resolvePageName
} from "../src/utils/nameResolver";

describe("nameResolver", () => {
  it("detects Next.js and TanStack page names", () => {
    expect(resolvePageName("/tmp/app/src/pages/payments/index.tsx")).toBe("payments");
    expect(resolvePageName("/tmp/app/src/app/checkout/page.tsx")).toBe("checkout");
    expect(resolvePageName("/tmp/app/src/app/products/[id]/page.tsx")).toBe("products");
    expect(resolvePageName("/tmp/app/src/routes/blog.$slug.tsx")).toBe("blog");
  });

  it("detects component names from default exports and fallbacks", () => {
    expect(
      resolveComponentName(
        "/tmp/app/src/components/CheckoutButton.tsx",
        "export default function CheckoutButton() { return null; }"
      )
    ).toBe("checkoutButton");
    expect(
      resolveComponentName(
        "/tmp/app/src/components/Hero.tsx",
        "const Hero = () => null; export default Hero;"
      )
    ).toBe("hero");
  });

  it("returns page or component metadata", () => {
    expect(resolveNameMetadata("/tmp/app/src/app/dashboard/page.tsx")).toEqual({
      type: "page",
      name: "dashboard"
    });
  });
});
