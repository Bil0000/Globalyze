# Globalyze

Globalyze is a Bun-powered CLI that internationalizes React and Next.js applications by scanning for hardcoded UI strings, generating semantic i18n keys, transforming source code, generating locale files, and translating those locale files automatically.

## What it does

Globalyze automates the repetitive parts of app internationalization:

1. scans a project for React source files
2. extracts hardcoded UI strings from JSX
3. generates semantic i18n keys with OpenAI
4. falls back to deterministic slug-based keys if AI is unavailable
5. rewrites JSX to use translation calls
6. generates locale files
7. translates locales with Lingo.dev
8. validates translation coverage in CI

## Before and after

Before:

```tsx
<button>Checkout</button>
```

After:

```tsx
<button>{t("checkout.button")}</button>
```

Generated locale:

```json
{
  "checkout.button": "Checkout"
}
```

## Requirements

- [Bun](https://bun.sh/) 1.2.20 or newer
- Node-compatible environment for Bun
- OpenAI API key if you want semantic AI key generation
- Lingo.dev API key if you want real translations instead of fallback copies

## Repository setup

Clone the repository and install dependencies:

```bash
git clone <your-repo-url>
cd globalyze
bun install
```

## Global CLI usage

Globalyze can be used as a repo-local CLI or as a globally available system command.

Best workflows:

- maintainer workflow: use a global link from your local checkout while iterating quickly
- user workflow: install directly from GitHub, then run `globalyze` inside any target app

### Maintainer workflow: link your local checkout globally

From the Globalyze repository root:

```bash
bun link
```

After that, from another project:

```bash
cd /Users/bilal/Documents/Calendaty
globalyze init
globalyze scan
globalyze run
```

This is the best option while the CLI is changing frequently, because edits in your local Globalyze checkout are immediately testable from other repositories.

### User workflow: install directly from GitHub

Users can install Globalyze globally from GitHub with Bun.

Example:

```bash
bun add -g github:<owner>/<repo>
```

For a concrete repository, that becomes:

```bash
bun add -g github:your-org/globalyze
```

After installation, users can run:

```bash
globalyze init
globalyze scan
globalyze run
```

from inside the target project directory.

### What `globalyze init` does in another repo

When run inside another project, `globalyze init` creates `globalyze.config.ts` in the current working directory. After that, `scan`, `transform`, `translate`, and `run` use that local config automatically.

## Environment variables

For local testing, exporting variables in your terminal is enough:

```bash
export OPENAI_API_KEY=your_openai_key
export LINGO_API_KEY=your_lingo_key
```

If you want them to persist across sessions, add them to your shell profile such as `~/.zshrc`:

```bash
export OPENAI_API_KEY=your_openai_key
export LINGO_API_KEY=your_lingo_key
```

Then reload your shell:

```bash
source ~/.zshrc
```

Current behavior if variables are missing:

- no `OPENAI_API_KEY`: Globalyze generates deterministic fallback keys
- no `LINGO_API_KEY`: Globalyze copies English strings into the other locale files

This project does not load a `.env` file automatically.

## Default repository behavior

The checked-in [globalyze.config.ts](/Users/bilal/Documents/globalyze/globalyze.config.ts) points to the included demo app:

- source: `examples/demo-nextjs/src`
- locales: `examples/demo-nextjs/locales`

That means this works immediately from the repo root:

```bash
bun run globalyze run
```

## Local development commands

Install dependencies:

```bash
bun install
```

Run unit tests:

```bash
bun test
```

Run lint:

```bash
bun run lint
```

Run TypeScript validation:

```bash
./node_modules/.bin/tsc --noEmit
```

## How to test the CLI in this repository

### 1. Scan the demo app

```bash
bun run globalyze scan
```

This prints detected hardcoded JSX strings from the demo project.

### 2. Run the full pipeline

```bash
bun run globalyze run
```

This will:

1. scan the demo source tree
2. extract strings
3. generate translation keys
4. transform JSX files
5. write locale files
6. translate target locales

### 3. Inspect the results

Check transformed source files:

- [examples/demo-nextjs/src/app/page.tsx](/Users/bilal/Documents/globalyze/examples/demo-nextjs/src/app/page.tsx)
- [examples/demo-nextjs/src/components/MarketingHero.tsx](/Users/bilal/Documents/globalyze/examples/demo-nextjs/src/components/MarketingHero.tsx)
- [examples/demo-nextjs/src/components/PricingSection.tsx](/Users/bilal/Documents/globalyze/examples/demo-nextjs/src/components/PricingSection.tsx)

Check generated locale files:

- [examples/demo-nextjs/locales/en.json](/Users/bilal/Documents/globalyze/examples/demo-nextjs/locales/en.json)
- [examples/demo-nextjs/locales/ar.json](/Users/bilal/Documents/globalyze/examples/demo-nextjs/locales/ar.json)
- [examples/demo-nextjs/locales/fr.json](/Users/bilal/Documents/globalyze/examples/demo-nextjs/locales/fr.json)
- [examples/demo-nextjs/locales/de.json](/Users/bilal/Documents/globalyze/examples/demo-nextjs/locales/de.json)

### 4. Validate translation coverage

```bash
bun run globalyze translate --check
```

This fails if any non-source locale file has missing or empty keys.

### 5. Run CI-style checks locally

```bash
bun run globalyze scan --fail-on-findings
bun run globalyze translate --check
```

This simulates the behavior of the GitHub Actions workflow.

## CLI commands

Initialize a new config:

```bash
bun run globalyze init
```

Scan a project:

```bash
bun run globalyze scan
```

Scan and print JSON:

```bash
bun run globalyze scan --json
```

Transform files and sync locales:

```bash
bun run globalyze transform
```

Translate locales:

```bash
bun run globalyze translate
```

Check translation coverage:

```bash
bun run globalyze translate --check
```

Run the full pipeline:

```bash
bun run globalyze run
```

Override directories without editing config:

```bash
bun run globalyze run --source-dir ./src --locales-dir ./locales
```

Use a custom config file:

```bash
bun run globalyze run --config ./globalyze.config.ts
```

## Running Globalyze on another project

You have two practical ways to run Globalyze against a separate app.

### Concrete example: `/Users/bilal/Documents/Calendaty`

If your target app lives at:

```text
/Users/bilal/Documents/Calendaty
```

create this file:

```text
/Users/bilal/Documents/Calendaty/globalyze.config.ts
```

with:

```ts
export default {
  sourceDir: "src",
  localesDir: "locales",
  languages: ["en", "ar", "fr", "de"],
  ignore: ["node_modules", "dist", "build", ".next", ".git"],
  sourceLocale: "en",
  aiModel: "gpt-4o-mini",
  aiBatchSize: 20,
  translationImportPath: "@/i18n",
  translationFunctionName: "t"
};
```

Then run:

```bash
cd /Users/bilal/Documents/globalyze
bun run ./src/index.ts scan --config /Users/bilal/Documents/Calendaty/globalyze.config.ts
bun run ./src/index.ts transform --config /Users/bilal/Documents/Calendaty/globalyze.config.ts
bun run ./src/index.ts run --config /Users/bilal/Documents/Calendaty/globalyze.config.ts
bun run ./src/index.ts translate --check --config /Users/bilal/Documents/Calendaty/globalyze.config.ts
```

Recommended order for a real repo:

1. run `scan`
2. review the findings
3. commit a clean baseline in Calendaty
4. run `transform`
5. review the diff
6. run `run` if you want locale generation and translation too

### Option 1. Run Globalyze from this repository against another folder

Assume your target app lives at:

```text
/Users/bilal/Documents/my-next-app
```

Create a config file inside the target app:

```ts
export default {
  sourceDir: "src",
  localesDir: "locales",
  languages: ["en", "ar", "fr", "de"],
  ignore: ["node_modules", "dist", "build", ".next", ".git"]
};
```

Save it as:

```text
/Users/bilal/Documents/my-next-app/globalyze.config.ts
```

Then run Globalyze from this repository root:

```bash
bun run ./src/index.ts scan --config /Users/bilal/Documents/my-next-app/globalyze.config.ts
bun run ./src/index.ts transform --config /Users/bilal/Documents/my-next-app/globalyze.config.ts
bun run ./src/index.ts translate --config /Users/bilal/Documents/my-next-app/globalyze.config.ts
bun run ./src/index.ts run --config /Users/bilal/Documents/my-next-app/globalyze.config.ts
```

Important detail:

- paths inside `globalyze.config.ts` are resolved relative to the config file location, not this repo

So `sourceDir: "src"` means:

```text
/Users/bilal/Documents/my-next-app/src
```

### Option 2. Build or link the CLI and use it from another repo

Build the CLI:

```bash
bun run build
```

Or invoke it directly with Bun from anywhere:

```bash
bun /Users/bilal/Documents/globalyze/src/index.ts run --config /Users/bilal/Documents/my-next-app/globalyze.config.ts
```

If you want a globally available command during development, you can also use Bun linking tools in your environment, but invoking `src/index.ts` directly is the simplest and most predictable path while iterating.

## Example config for another project

```ts
export default {
  sourceDir: "src",
  localesDir: "locales",
  languages: ["en", "ar", "fr", "de"],
  ignore: ["node_modules", "dist", "build", ".next", ".git"],
  sourceLocale: "en",
  aiModel: "gpt-4o-mini",
  aiBatchSize: 20,
  translationImportPath: "@/i18n",
  translationFunctionName: "t"
};
```

## Expectations when running on another app

Globalyze currently assumes your target app can support:

- an import like `import { t } from "@/i18n";`
- a translation function named `t`

If your app uses a different import path or helper name, set these in config:

```ts
export default {
  sourceDir: "src",
  localesDir: "locales",
  languages: ["en", "fr"],
  translationImportPath: "~/lib/i18n",
  translationFunctionName: "t"
};
```

## Recommended test flow for a separate project

Before transforming a real application, use this order:

### 1. Create the config

```bash
touch /path/to/app/globalyze.config.ts
```

### 2. Run scan first

```bash
bun /Users/bilal/Documents/globalyze/src/index.ts scan --config /path/to/app/globalyze.config.ts
```

Review the findings before modifying files.

### 3. Commit your app first

Before running transforms on a real repository:

```bash
git add .
git commit -m "baseline before globalyze"
```

### 4. Run transform

```bash
bun /Users/bilal/Documents/globalyze/src/index.ts transform --config /path/to/app/globalyze.config.ts
```

### 5. Review the diff

Inspect:

- transformed JSX files
- generated locale files
- added `t(...)` imports

### 6. Run the app test suite

Inside the target application, run its normal checks:

```bash
bun test
bun run lint
```

If it is a Next.js app, also run:

```bash
bun run dev
```

## Demo project

The included demo app lives in [examples/demo-nextjs](/Users/bilal/Documents/globalyze/examples/demo-nextjs). It intentionally contains hardcoded UI strings so you can verify the full transformation flow end to end.

## Architecture

Core modules:

- [src/scanner/projectScanner.ts](/Users/bilal/Documents/globalyze/src/scanner/projectScanner.ts): recursive source discovery with `fast-glob`
- [src/extractor/stringExtractor.ts](/Users/bilal/Documents/globalyze/src/extractor/stringExtractor.ts): JSX string extraction via Babel AST traversal
- [src/ai/keyGenerator.ts](/Users/bilal/Documents/globalyze/src/ai/keyGenerator.ts): OpenAI-backed semantic key generation plus deterministic fallback
- [src/transformer/astTransformer.ts](/Users/bilal/Documents/globalyze/src/transformer/astTransformer.ts): AST-based JSX rewrites and import injection
- [src/i18n/localeManager.ts](/Users/bilal/Documents/globalyze/src/i18n/localeManager.ts): locale generation and missing-translation detection
- [src/lingo/lingoClient.ts](/Users/bilal/Documents/globalyze/src/lingo/lingoClient.ts): translation integration with fallback behavior
- [src/commands](/Users/bilal/Documents/globalyze/src/commands): Commander.js command handlers
- [src/cli/pipeline.ts](/Users/bilal/Documents/globalyze/src/cli/pipeline.ts): orchestration layer for scan, transform, translate, and full run

## GitHub Actions

The repository ships with [globalyze.yml](/Users/bilal/Documents/globalyze/.github/workflows/globalyze.yml).

It runs on pull requests and supports two modes:

- enforcement mode: fails when hardcoded strings or missing translations are detected
- auto-fix mode: runs the full pipeline and commits updated locale files

Auto-fix can be enabled by:

- setting repository variable `GLOBALYZE_AUTO_FIX=true`, or
- running the workflow manually with `auto_fix=true`

The auto-fix commit message is:

```text
globalyze bot: add missing translations
```

## Troubleshooting

### Missing config file

Error:

```text
Missing config file at ...
```

Fix:

```bash
bun run globalyze init
```

Or provide `--config /absolute/path/to/globalyze.config.ts`.

### Source directory does not exist

Check that `sourceDir` in your config is correct relative to the config file location.

### Keys look generic

If `OPENAI_API_KEY` is missing or the API call fails, fallback key generation is used.

### Translations are just English copies

If `LINGO_API_KEY` is missing, target locale files are populated with source English text.

### Import path is wrong for your app

Set:

```ts
translationImportPath: "your/import/path"
```

### Translation function name differs

Set:

```ts
translationFunctionName: "yourFunctionName"
```

## License

MIT
