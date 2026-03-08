import path from "node:path";

import fs from "fs-extra";

import { normalizeLanguageCodes, toPosixPath } from "../utils/fileUtils";
import type { DetectedLanguageResult } from "../types";

const LANGUAGE_REGEX = /\b([a-z]{2}(?:-[A-Z]{2})?)\b/g;

function collectFromText(source: string): string[] {
  const matches = source.match(LANGUAGE_REGEX) ?? [];
  return matches.map((match) => match.toLowerCase());
}

export async function detectProjectLanguages(rootDir: string): Promise<DetectedLanguageResult> {
  const detected = new Set<string>();
  const sources = new Set<string>();
  const localesDir = path.join(rootDir, "locales");

  if (await fs.pathExists(localesDir)) {
    const entries = await fs.readdir(localesDir);

    for (const entry of entries) {
      const fullPath = path.join(localesDir, entry);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        detected.add(entry.toLowerCase());
        sources.add("existing locale folders");
        continue;
      }

      const match = /^([a-z]{2}(?:-[A-Z]{2})?)\./.exec(entry);

      if (match?.[1]) {
        detected.add(match[1].toLowerCase());
        sources.add("existing locale files");
      }
    }
  }

  for (const configName of ["next.config.js", "next.config.ts", "next.config.mjs"]) {
    const configPath = path.join(rootDir, configName);

    if (!(await fs.pathExists(configPath))) {
      continue;
    }

    const source = await fs.readFile(configPath, "utf8");

    if (source.includes("i18n")) {
      for (const language of collectFromText(source)) {
        detected.add(language);
      }

      sources.add(configName);
    }
  }

  const packageJsonPath = path.join(rootDir, "package.json");

  if (await fs.pathExists(packageJsonPath)) {
    const packageJson = (await fs.readJson(packageJsonPath)) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      homepage?: string;
    };
    const dependencies = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {})
    };

    if (
      dependencies.i18next ||
      dependencies["react-intl"] ||
      dependencies["next-intl"]
    ) {
      sources.add("existing i18n dependencies");
    }

    const homepage = packageJson.homepage;

    if (typeof homepage === "string") {
      const normalized = toPosixPath(homepage);
      const domainMatch = /\.([a-z]{2})(?:\/|$)/i.exec(normalized);

      if (domainMatch?.[1]) {
        detected.add(domainMatch[1].toLowerCase());
        sources.add("homepage domain");
      }
    }
  }

  const languages = normalizeLanguageCodes([...detected], "en");

  return {
    languages,
    sources: [...sources]
  };
}
