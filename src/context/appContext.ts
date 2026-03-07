import path from "node:path";

import fs from "fs-extra";
import fg from "fast-glob";

import { extractStringsFromFiles } from "../extractor/stringExtractor";
import {
  DEFAULT_IGNORE,
  SUPPORTED_EXTENSIONS
} from "../utils/fileUtils";

const CATEGORY_KEYWORDS = {
  scheduling: [
    "calendar",
    "schedule",
    "booking",
    "book",
    "appointment",
    "reminder",
    "meeting"
  ],
  commerce: [
    "checkout",
    "cart",
    "buy",
    "order",
    "store",
    "pricing",
    "product"
  ],
  saas: [
    "dashboard",
    "workspace",
    "team",
    "project",
    "settings",
    "analytics",
    "integration"
  ],
  marketing: [
    "hero",
    "trial",
    "free trial",
    "get started",
    "contact support",
    "enterprise",
    "launch"
  ]
} as const;

function detectFramework(rootDir: string, sourceTexts: readonly string[]): string {
  const packageJsonPath = path.join(rootDir, "package.json");

  if (fs.existsSync(packageJsonPath)) {
    const packageJson = fs.readJsonSync(packageJsonPath) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyNames = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {})
    ]);

    if (dependencyNames.has("next")) {
      return "Next.js";
    }

    if (dependencyNames.has("react")) {
      return "React";
    }
  }

  const combinedText = sourceTexts.join(" ").toLowerCase();

  if (combinedText.includes("use client") || combinedText.includes("next")) {
    return "Next.js";
  }

  return "React";
}

function scoreCategory(
  category: keyof typeof CATEGORY_KEYWORDS,
  haystack: string
): number {
  return CATEGORY_KEYWORDS[category].reduce(
    (score, keyword) => score + (haystack.includes(keyword) ? 1 : 0),
    0
  );
}

function inferCategory(sourceTexts: readonly string[]): keyof typeof CATEGORY_KEYWORDS | "generic" {
  const haystack = sourceTexts.join(" ").toLowerCase();
  let bestCategory: keyof typeof CATEGORY_KEYWORDS | "generic" = "generic";
  let bestScore = 0;

  for (const category of Object.keys(CATEGORY_KEYWORDS) as (
    keyof typeof CATEGORY_KEYWORDS
  )[]) {
    const score = scoreCategory(category, haystack);

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

function buildInstructions(
  framework: string,
  category: keyof typeof CATEGORY_KEYWORDS | "generic"
): string[] {
  const appSummary =
    category === "generic"
      ? `This is a ${framework} application with user-facing UI text.`
      : `This is a ${framework} ${category} application.`;

  const domainInstruction =
    category === "scheduling"
      ? "Use clear scheduling terminology for bookings, calendars, reminders, and dates."
      : category === "commerce"
        ? "Use natural commerce wording for pricing, checkout, orders, and purchase actions."
        : category === "saas"
          ? "Keep software, workspace, and account terminology concise and consistent."
          : category === "marketing"
            ? "Keep marketing copy and CTA labels short, natural, and persuasive."
            : "Keep labels, actions, and short UI text concise and natural for the target locale.";

  return [
    appSummary,
    domainInstruction,
    "Do not translate brand names or product names unless they are already localized."
  ];
}

export async function inferTranslationInstructions(
  rootDir: string,
  sourceDir = "src",
  ignore: readonly string[] = DEFAULT_IGNORE
): Promise<string[]> {
  const resolvedSourceDir = path.resolve(rootDir, sourceDir);

  if (!(await fs.pathExists(resolvedSourceDir))) {
    return buildInstructions("React", "generic");
  }

  const extensionPattern = SUPPORTED_EXTENSIONS.map((extension) =>
    extension.replace(".", "")
  ).join(",");
  const ignorePatterns = ignore.flatMap((directory) => [
    `**/${directory}/**`,
    `${directory}/**`
  ]);
  const files = await fg([`**/*.{${extensionPattern}}`], {
    cwd: resolvedSourceDir,
    absolute: true,
    onlyFiles: true,
    ignore: ignorePatterns,
    followSymbolicLinks: false
  });

  if (files.length === 0) {
    return buildInstructions("React", "generic");
  }

  const strings = await extractStringsFromFiles(files);
  const sourceTexts = strings.map((item) => item.text);
  const framework = detectFramework(rootDir, sourceTexts);
  const category = inferCategory(sourceTexts);

  return buildInstructions(framework, category);
}
