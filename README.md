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
9. previews and scores i18n changes before writing them
10. watches source trees for new hardcoded UI strings
11. scans screenshots for UI text missing from locales

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

You can still export variables in your terminal:

```bash
export OPENAI_API_KEY=your_openai_key
export LINGO_API_KEY=your_lingo_key
```

You can also add them to your shell profile such as `~/.zshrc`:

```bash
export OPENAI_API_KEY=your_openai_key
export LINGO_API_KEY=your_lingo_key
```

Then reload your shell:

```bash
source ~/.zshrc
```

Recommended setup for real usage:

Create a `.env` file in the Globalyze repository root:

```bash
OPENAI_API_KEY=your_openai_key
LINGO_API_KEY=your_lingo_key
```

Globalyze now loads:

- `.env`
- `.env.local`

from the main Globalyze repository or installed package root.

That means once you set the keys in Globalyze’s own `.env`, you do not need to export them in each terminal session, and target projects do not need their own `.env` files for Globalyze to work.

Current behavior if variables are missing:

- no `OPENAI_API_KEY`: Globalyze generates deterministic fallback keys
- no `LINGO_API_KEY`: Globalyze copies English strings into the other locale files

Existing shell environment variables still take precedence over `.env` values.

## Default repository behavior

The checked-in [globalyze.config.ts](/Users/bilal/Documents/globalyze/globalyze.config.ts) points to the included demo app:

- source: `examples/demo-nextjs/src`
- locales: `examples/demo-nextjs/locales`

That means this works immediately from the repo root:

```bash
bun run globalyze run
```

Preview changes without modifying files:

```bash
bun run globalyze preview
```

Watch for new strings during development:

```bash
bun run globalyze watch
```

Analyze a screenshot for UI text missing from locales:

```bash
bun run globalyze screenshot ./captures/checkout.png
```

Score the repository’s current i18n health:

```bash
bun run globalyze score
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

## Interactive CLI

Running `globalyze` without a command opens an interactive menu so you can launch the main workflows without remembering subcommands.

Available actions include:

- scan project for strings
- preview transformations
- transform source code
- generate translations
- watch for new strings
- analyze a screenshot
- show translation report
- show project score
- run the full pipeline

## Preview mode

Preview source transformations without writing files:

```bash
globalyze preview
```

This runs the existing transform pipeline in memory and prints:

- the original source snippet
- the transformed source snippet
- a unified diff for each changed file

## Watch mode

Watch the configured source directory for new hardcoded UI strings:

```bash
globalyze watch
```

When changes are detected, Globalyze:

1. rescans the project
2. detects newly introduced UI strings
3. reuses existing keys for similar copy changes when possible
4. transforms affected files
5. syncs locale files

## Screenshot detection

Analyze a screenshot and compare OCR text against your locale files:

```bash
globalyze screenshot ./captures/checkout.png
```

This helps catch UI text that appears in the app but is missing from your localization dictionaries.

## Repository score

Generate a high-level internationalization score for the current project:

```bash
globalyze score
```

The score combines:

- translation coverage
- remaining hardcoded UI strings
- locale completeness
- unused locale keys

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

## Interactive CLI

Running `globalyze` with no arguments launches an interactive menu:

```bash
globalyze
```

Available actions:

- Scan project for strings
- Transform source code
- Generate translations
- Run full pipeline
- Show translation report
- Exit

The interactive menu routes to the same command implementations used by the standard CLI commands.

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

Generate a translation coverage report:

```bash
bun run globalyze report
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

## Translation Coverage Report

Generate a coverage report from locale files:

```bash
globalyze report
```

Example output:

```text
Globalyze Translation Report
Source locale: en
Total keys: 120

Languages
English    100% (120/120)
Arabic      96% (115/120)
French      94% (113/120)

Missing Keys

Arabic
- checkout.buy_button
- home.hero_title

French
- pricing.plan_title
```

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

It runs on pull requests and uses always-on auto-fix behavior.

Workflow behavior:

1. install dependencies
2. run `globalyze run`
3. commit any generated changes
4. push those changes back to the PR branch when permissions allow it
5. run enforcement checks afterward:
   - `globalyze scan --fail-on-findings`
   - `globalyze translate --check`

This means the workflow tries to fix the branch automatically first, then fails only if problems still remain after the auto-fix pass.

The auto-fix commit message is:

```text
globalyze bot: add missing translations
```

If the pull request comes from a fork, GitHub may block the workflow from pushing changes back to the branch. In that case the workflow still runs and reports the limitation, but the contributor must apply the fixes locally.

How to test the workflow locally:

```bash
bun run ./src/index.ts run
bun run ./src/index.ts scan --fail-on-findings
bun run ./src/index.ts translate --check
```

How to test it in GitHub:

1. push a branch
2. open a pull request
3. go to the Actions tab
4. inspect the `Globalyze` workflow run

If Globalyze can auto-fix the branch, it will commit and push the updates. If it cannot fully resolve the issues, the final enforcement steps will fail and show what still needs attention.

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
