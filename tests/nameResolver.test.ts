import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  buildFileLocalizationMetadata,
  resolveComponentName,
  resolveNameMetadata,
  resolvePageName
} from "../src/utils/nameResolver";

describe("nameResolver", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
    tempDirectories.length = 0;
  });

  it("detects Next.js and TanStack page names", () => {
    expect(resolvePageName("/tmp/app/src/pages/payments/index.tsx")).toBe("payments");
    expect(resolvePageName("/tmp/app/src/app/checkout/page.tsx")).toBe("checkout");
    expect(resolvePageName("/tmp/app/src/app/products/[id]/page.tsx")).toBe("products");
    expect(resolvePageName("/tmp/app/src/routes/blog.$slug.tsx")).toBe("blog");
    expect(resolvePageName("/tmp/app/src/app/components/Table.tsx")).toBeNull();
    expect(resolvePageName("/tmp/app/src/pages/components/Table.tsx")).toBeNull();
    expect(resolvePageName("/tmp/app/src/routes/components/Table.tsx")).toBeNull();
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

  it("resolves page ownership through alias imports and tracks shared components", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-name-resolver-"));
    tempDirectories.push(rootDir);

    await mkdir(path.join(rootDir, "src", "app", "checkout"), {
      recursive: true
    });
    await mkdir(path.join(rootDir, "src", "app", "pricing"), {
      recursive: true
    });
    await mkdir(path.join(rootDir, "src", "components"), {
      recursive: true
    });

    const homePage = path.join(rootDir, "src", "app", "page.tsx");
    const checkoutPage = path.join(rootDir, "src", "app", "checkout", "page.tsx");
    const pricingPage = path.join(rootDir, "src", "app", "pricing", "page.tsx");
    const heroComponent = path.join(rootDir, "src", "components", "MarketingHero.tsx");
    const sharedComponent = path.join(rootDir, "src", "components", "SharedBanner.tsx");

    await writeFile(
      homePage,
      'import { MarketingHero } from "@/components/MarketingHero"; export default function Page() { return <MarketingHero />; }\n',
      "utf8"
    );
    await writeFile(
      checkoutPage,
      'import { SharedBanner } from "@/components/SharedBanner"; export default function CheckoutPage() { return <SharedBanner />; }\n',
      "utf8"
    );
    await writeFile(
      pricingPage,
      'import { SharedBanner } from "@/components/SharedBanner"; export default function PricingPage() { return <SharedBanner />; }\n',
      "utf8"
    );
    await writeFile(
      heroComponent,
      "export function MarketingHero() { return null; }\n",
      "utf8"
    );
    await writeFile(
      sharedComponent,
      "export function SharedBanner() { return null; }\n",
      "utf8"
    );

    const metadata = await buildFileLocalizationMetadata([
      homePage,
      checkoutPage,
      pricingPage,
      heroComponent,
      sharedComponent
    ]);

    expect(metadata.get(heroComponent)?.pageName).toBe("home");
    expect(metadata.get(heroComponent)?.pageNames).toEqual(["home"]);
    expect(metadata.get(sharedComponent)?.pageName).toBeUndefined();
    expect(metadata.get(sharedComponent)?.pageNames).toEqual([
      "checkout",
      "pricing"
    ]);
  });

  it("resolves page ownership through tsconfig baseUrl and path aliases", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "globalyze-name-resolver-"));
    tempDirectories.push(rootDir);

    await mkdir(path.join(rootDir, "src", "app", "dashboard"), {
      recursive: true
    });
    await mkdir(path.join(rootDir, "src", "components", "navigation"), {
      recursive: true
    });
    await writeFile(
      path.join(rootDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            baseUrl: ".",
            paths: {
              "@components/*": ["src/components/*"]
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const dashboardPage = path.join(
      rootDir,
      "src",
      "app",
      "dashboard",
      "page.tsx"
    );
    const breadcrumbComponent = path.join(
      rootDir,
      "src",
      "components",
      "navigation",
      "Breadcrumb.tsx"
    );
    const carouselComponent = path.join(
      rootDir,
      "src",
      "components",
      "navigation",
      "Carousel.tsx"
    );

    await writeFile(
      dashboardPage,
      [
        'import { Breadcrumb } from "@components/navigation/Breadcrumb";',
        'import { Carousel } from "src/components/navigation/Carousel";',
        "export default function DashboardPage() {",
        "  return (",
        "    <>",
        "      <Breadcrumb />",
        "      <Carousel />",
        "    </>",
        "  );",
        "}",
        ""
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      breadcrumbComponent,
      "export function Breadcrumb() { return null; }\n",
      "utf8"
    );
    await writeFile(
      carouselComponent,
      "export function Carousel() { return null; }\n",
      "utf8"
    );

    const metadata = await buildFileLocalizationMetadata([
      dashboardPage,
      breadcrumbComponent,
      carouselComponent
    ]);

    expect(metadata.get(breadcrumbComponent)?.pageName).toBe("dashboard");
    expect(metadata.get(carouselComponent)?.pageName).toBe("dashboard");
  });
});
