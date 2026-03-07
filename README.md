# Globalyze

Globalyze is a Bun-powered CLI that internationalizes React and Next.js apps by finding hardcoded UI strings, generating semantic translation keys, rewriting source code, creating locale files, and validating localization quality in CI.

## Why Globalyze

Internationalization usually starts late and turns into a cleanup project:

- hardcoded strings are scattered across JSX
- translation keys are inconsistent or meaningless
- locale files drift from source code
- PRs introduce untranslated copy with no enforcement

Globalyze automates that workflow so teams can move from hardcoded UI copy to structured locale files with a CLI-first developer experience.

## Quick Demo

Input:

```tsx
<button>Checkout</button>
```

Run:

```bash
globalyze run
```

Output:

```tsx
<button>{t("checkout.button")}</button>
```

Generated locale entry:

```json
{
  "checkout.button": "Checkout"
}
```

## Feature Overview

- Scans React and Next.js source trees for `.ts`, `.tsx`, `.js`, and `.jsx`
- Extracts JSX text, string literals inside JSX, and selected translatable JSX attributes
- Generates semantic i18n keys with OpenAI using `gpt-4o-mini`
- Reuses similar existing keys for small copy changes
- Falls back to deterministic slug-based keys when AI is unavailable
- Rewrites source files with Babel AST transforms
- Injects the configured translation import automatically
- Creates and synchronizes locale JSON files
- Translates target locales with Lingo.dev
- Falls back to English values when translation credentials or network access are unavailable
- Checks translation coverage and reports missing keys
- Scores repository i18n quality
- Previews transformations without writing files
- Watches source files for new hardcoded strings
- Scans screenshots with OCR to find text missing from locale files
- Includes an interactive CLI when `globalyze` is run without a command
- Ships with a GitHub Actions workflow for auto-fix and enforcement

## Supported Projects

Globalyze currently targets:

- React applications
- Next.js applications

The parser and scanner support:

- `.ts`
- `.tsx`
- `.js`
- `.jsx`

## Installation

Requirements:

- [Bun](https://bun.sh/) `>= 1.2.20`

Clone and install:

```bash
git clone <your-repo-url>
cd globalyze
bun install
```

Run from source:

```bash
bun run globalyze --help
```

Make the CLI available globally from your local checkout:

```bash
bun link
```

After that:

```bash
globalyze --help
```

Install directly from GitHub:

```bash
bun add -g github:<owner>/<repo>
```

## Quick Start

### 1. Initialize a project

Inside the target repository:

```bash
globalyze init
```

This creates `globalyze.config.ts`.

To customize the initial language set:

```bash
globalyze init --langs de,fr
```

That generates a config with `["en", "de", "fr"]`.

### 2. Scan for hardcoded strings

```bash
globalyze scan
```

### 3. Preview what will change

```bash
globalyze preview
```

### 4. Transform source and create locale files

```bash
globalyze transform
```

### 5. Translate locale files

```bash
globalyze translate
```

### 6. Run the full pipeline

```bash
globalyze run
```

## Environment Variables

Globalyze loads `.env` and `.env.local` from the Globalyze repository or installed package root.

Common variables:

```bash
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
LINGO_API_KEY=your_lingo_key
```

Behavior when keys are missing:

- No `OPENAI_API_KEY`: Globalyze uses deterministic fallback keys
- OpenAI rate-limited (`429`) and `GEMINI_API_KEY` is set: Globalyze retries semantic key generation with Gemini using a low-cost fallback model
- OpenAI rate-limited and no Gemini key is configured: Globalyze warns and falls back to deterministic keys
- OpenAI and Gemini both rate-limited or unavailable: Globalyze warns in the CLI and falls back to deterministic keys
- No `LINGO_API_KEY`: Globalyze copies English source values into target locales

## CLI Commands

### `globalyze`

Launches the interactive menu.

### `globalyze init`

Creates `globalyze.config.ts` in the current directory.

Options:

- `-f, --force` overwrite an existing config file
- `--langs <codes>` replace the default language list at initialization time

Examples:

```bash
globalyze init
globalyze init --langs de,fr
```

### `globalyze add <codes...>`

Adds one or more languages to an existing project config from the CLI.

```bash
globalyze add tr es
```

What it does:

- updates `globalyze.config.ts`
- syncs locale files for the new languages
- translates the new locale files if source keys already exist

Options:

- `-c, --config <path>`

### `globalyze scan`

Scans the configured source tree and prints detected hardcoded UI strings.

Options:

- `-c, --config <path>`
- `--source-dir <path>`
- `--locales-dir <path>`
- `--json`
- `--fail-on-findings`

### `globalyze preview`

Runs the transform pipeline in memory and prints before/after output plus a diff.

Options:

- `-c, --config <path>`
- `--source-dir <path>`
- `--locales-dir <path>`

### `globalyze transform`

Extracts strings, generates keys, rewrites source files, and syncs locale files.

Options:

- `-c, --config <path>`
- `--source-dir <path>`
- `--locales-dir <path>`

### `globalyze translate`

Translates locale files using Lingo.dev.

Options:

- `-c, --config <path>`
- `--source-dir <path>`
- `--locales-dir <path>`
- `--check` validate locale coverage without translating

### `globalyze report`

Shows translation coverage by language and lists missing keys.

Options:

- `-c, --config <path>`
- `--source-dir <path>`
- `--locales-dir <path>`

### `globalyze score`

Generates an i18n quality score from coverage, hardcoded string count, and locale health.

Options:

- `-c, --config <path>`
- `--source-dir <path>`
- `--locales-dir <path>`

### `globalyze screenshot <image>`

Runs OCR on a screenshot and flags text missing from locale files.

Options:

- `-c, --config <path>`
- `--source-dir <path>`
- `--locales-dir <path>`

### `globalyze watch`

Watches the source directory for new hardcoded strings, transforms changed files, and syncs locales.

Options:

- `-c, --config <path>`
- `--source-dir <path>`
- `--locales-dir <path>`

Note:

- `watch` updates locale files but does not automatically perform a separate translation pass for new keys; run `globalyze translate` or `globalyze run` if you want target locale values refreshed immediately

### `globalyze run`

Runs the full pipeline:

1. scan files
2. extract strings
3. generate keys
4. transform source
5. sync locale files
6. translate target locales

Options:

- `-c, --config <path>`
- `--source-dir <path>`
- `--locales-dir <path>`

## Configuration

Globalyze is configured with `globalyze.config.ts`.

Example:

```ts
export default {
  sourceDir: "src",
  localesDir: "locales",
  languages: ["en", "ar", "fr", "de"],
  ignore: ["node_modules", "dist", "build", ".next", ".git"],
  translationInstructions: [
    "This is a Next.js commerce application.",
    "Use natural commerce wording for pricing, checkout, orders, and purchase actions.",
    "Do not translate brand names or product names unless they are already localized."
  ],
  sourceLocale: "en",
  openAiModel: "gpt-4o-mini",
  geminiModel: "gemini-2.5-flash-lite",
  aiBatchSize: 20,
  translationImportPath: "@/i18n",
  translationFunctionName: "t"
};
```

### Config fields

- `sourceDir`: source directory to scan
- `localesDir`: directory where locale JSON files are stored
- `languages`: supported locales
- `ignore`: ignored directories
- `translationInstructions`: editable translation context inferred during `globalyze init` and forwarded to Lingo as per-key hints
- `sourceLocale`: canonical source locale, default `en`
- `openAiModel`: OpenAI model for key generation
- `geminiModel`: Gemini model used only when OpenAI key generation is rate-limited
- `aiBatchSize`: number of strings per key-generation batch
- `translationImportPath`: import path to inject when transforming source
- `translationFunctionName`: translation function name to call in transformed JSX
- `lingoApiUrl`: optional custom Lingo API base URL

## Using Globalyze On Another Repository

Create a config file in the target repository and run Globalyze from there.

Example for a separate app in `/Users/bilal/Documents/Calendaty`:

```ts
export default {
  sourceDir: "src",
  localesDir: "locales",
  languages: ["en", "ar", "fr", "de"],
  ignore: ["node_modules", "dist", "build", ".next", ".git"]
};
```

Then:

```bash
cd /Users/bilal/Documents/Calendaty
globalyze init
globalyze scan
globalyze run
```

## Interactive CLI

Running `globalyze` with no arguments opens a prompt-driven menu powered by `@clack/prompts`.

Available actions:

- Scan project for strings
- Preview transformations
- Transform source code
- Generate translations
- Watch for new strings
- Analyze screenshot
- Run full pipeline
- Show translation report
- Show project score

## CI And Automation

Globalyze includes a GitHub Actions workflow at [.github/workflows/globalyze.yml](/Users/bilal/Documents/globalyze/.github/workflows/globalyze.yml).

Current workflow behavior:

- runs on `pull_request`
- installs Bun dependencies
- runs `globalyze run`
- commits generated changes with `globalyze bot: add missing translations`
- pushes fixes back to the PR branch when allowed
- runs `globalyze scan --fail-on-findings`
- runs `globalyze translate --check`

Fork limitation:

- GitHub Actions cannot push fixes back to forked pull requests with the current permissions model

To use the same automation in another repository:

1. copy the workflow file into that repository
2. install Globalyze there or make it available globally
3. add `globalyze.config.ts`
4. configure secrets such as `LINGO_API_KEY` if you want real translations

## Demo Project

The repository includes a demo Next.js app in [examples/demo-nextjs](/Users/bilal/Documents/globalyze/examples/demo-nextjs).

The checked-in root config points to that demo:

- source: `examples/demo-nextjs/src`
- locales: `examples/demo-nextjs/locales`

That means you can try the tool immediately from the repository root.

## Architecture Overview

Globalyze is organized as a small set of focused modules:

- `src/scanner`
  Finds candidate source files with `fast-glob`
- `src/extractor`
  Parses files with Babel and extracts UI strings or existing translation keys
- `src/ai`
  Generates semantic keys with OpenAI and handles similarity-based key reuse
- `src/transformer`
  Rewrites JSX AST nodes and injects the translation import
- `src/i18n`
  Builds, merges, syncs, and validates locale dictionaries
- `src/lingo`
  Handles translation via Lingo.dev with safe English fallback behavior
- `src/report`
  Computes translation coverage and project score summaries
- `src/preview`
  Produces in-memory diffs for transform previews
- `src/watch`
  Watches source changes and performs incremental updates
- `src/ocr`
  Extracts screenshot text with Tesseract and compares it to locale values
- `src/commands`
  Implements each CLI command
- `src/cli`
  Wires Commander, interactive mode, and shared pipeline helpers
- `src/utils`
  Config loading, logging, progress, interrupts, and shared filesystem helpers

High-level flow:

1. load config and environment
2. scan source files
3. extract candidate UI strings
4. generate or reuse translation keys
5. transform source files
6. sync locale files
7. optionally translate target locales
8. validate/report in CI and local workflows

## Development Workflow

Install dependencies:

```bash
bun install
```

Run tests:

```bash
bun test
```

Run lint:

```bash
bun run lint
```

Type-check:

```bash
./node_modules/.bin/tsc --noEmit
```

Build the CLI:

```bash
bun run build
```

## Contributing

Contributions are welcome.

Suggested workflow:

1. create a branch
2. make a focused change
3. run tests, lint, and type-check locally
4. update documentation when behavior changes
5. open a pull request

When contributing, prefer:

- strict TypeScript with no `any`
- small, focused modules
- AST-safe transformations over string manipulation
- tests for new behavior and regressions

## License

MIT. See [package.json](/Users/bilal/Documents/globalyze/package.json) for the current license declaration.
