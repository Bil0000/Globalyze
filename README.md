# Globalyze

Globalyze is a Bun-powered, runtime-agnostic CLI that globalizes React and Next.js apps by finding hardcoded UI strings, generating semantic translation keys, rewriting source code, creating locale files, and validating localization quality in CI.

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
globalyze globalize
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
- Extracts dynamic JSX interpolation templates such as ``{user.name} added {count} items``
- Generates semantic i18n keys with OpenAI using `gpt-4o-mini`
- Uses file path, page name, component name, and JSX element type as AI key-generation context
- Reuses similar existing keys for small copy changes
- Falls back to deterministic slug-based keys when AI is unavailable
- Rewrites source files with Babel AST transforms
- Injects adapter-aware translation calls for generic, `react-i18next`, and `next-intl` setups
- Creates and synchronizes locale files in configurable JSON or JavaScript layouts
- Translates target locales with Lingo.dev
- Caches translated strings in `.globalyze/translations.json`
- Falls back to English values when translation credentials or network access are unavailable
- Tracks key usage, origin metadata, and governance metadata in `.globalyze/translationGraph.json`
- Bootstraps `.globalyze/` automatically on first command run
- Supports runtime adapters for generic/custom runtimes, `react-i18next`, `next-intl`, and `react-intl`
- Separates one-time migration (`globalize`) from ongoing maintenance (`sync`)
- Supports translation ownership, locking, and approval-aware governance workflows
- Detects duplicate source texts, unused keys, and supports key renames from the CLI
- Ships an ESLint plugin rule for hardcoded JSX strings
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
- TanStack Start route trees for page-name inference

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
git clone https://github.com/Bil0000/Globalyze.git
cd globalyze
bun install
```

Run from source:

```bash
bun run globalyze --help
```

Install the AI skill from this repo:

```bash
npx skills add Bil0000/Globalyze --skill globalyze
```

If your installer expects a repo path instead of a skill name:

```bash
npx skills add Bil0000/Globalyze --path skills/globalyze
```

The skill lives at [skills/globalyze/SKILL.md](/Users/bilal/Documents/globalyze/skills/globalyze/SKILL.md) and is designed for agent tools such as Cursor, Codex, or Claude-style workflows that should drive the `globalyze` CLI for a target project.

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
bun add -g github:Bil0000/Globalyze
```

Repository URLs:

- HTTPS: [https://github.com/Bil0000/Globalyze.git](https://github.com/Bil0000/Globalyze.git)
- SSH: `git@github.com:Bil0000/Globalyze.git`

## Quick Start

### 1. Initialize a project

Inside the target repository:

```bash
globalyze init
```

This creates `globalyze.config.ts`.

During initialization, Globalyze auto-detects likely project languages from existing locale files, Next.js config, and common i18n libraries, then asks whether to use the detected set.

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

### 4. Run the full pipeline

```bash
globalyze sync
```

## Environment Variables

Globalyze loads `.env` and `.env.local` from the Globalyze repository or installed package root.

Common variables:

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_API_KEYS=your_openai_key_1,your_openai_key_2
OPENAI_API_KEY_3=your_openai_key_3
GEMINI_API_KEY=your_gemini_key
GEMINI_API_KEYS=your_gemini_key_1,your_gemini_key_2
GEMINI_API_KEY_3=your_gemini_key_3
LINGO_API_KEY=your_lingo_key
```

Globalyze supports:

- single keys via `OPENAI_API_KEY` and `GEMINI_API_KEY`
- comma-separated key pools via `OPENAI_API_KEYS` and `GEMINI_API_KEYS`
- numbered keys like `OPENAI_API_KEY_2`, `OPENAI_API_KEY_3`, `GEMINI_API_KEY_2`, and so on

For semantic key generation, Globalyze rotates through all configured OpenAI keys first. If every OpenAI key is rate-limited, it rotates through all configured Gemini keys. If both pools are exhausted, it falls back to deterministic keys for that run.

When you run any Globalyze command, the CLI bootstraps `.globalyze/` automatically if it does not already exist. That state directory contains the translation graph and translation cache used by inspection, sync, and learning-based ownership reuse.

Behavior when keys are missing:

- No OpenAI keys configured: Globalyze uses deterministic fallback keys
- OpenAI rate-limited (`429`) and Gemini keys are configured: Globalyze retries semantic key generation with Gemini using a low-cost fallback model
- OpenAI rate-limited and no Gemini keys are configured: Globalyze warns and falls back to deterministic keys
- OpenAI and Gemini both rate-limited or unavailable: Globalyze warns in the CLI and falls back to deterministic keys
- No `LINGO_API_KEY`: Globalyze copies English source values into target locales

## CLI Commands

### `globalyze`

Launches the interactive menu.

### Primary Commands

### `globalyze globalize`

Runs the one-time migration workflow for a non-internationalized project.

What it does:

- scans for hardcoded UI strings
- generates semantic keys
- transforms source code
- syncs locale files
- translates target locales
- writes adapter guidance when runtime/provider injection is ambiguous

### `globalyze sync`

Maintains an already-globalized project.

What it does:

- detects new UI strings
- updates locale files
- translates new entries
- refreshes the translation graph
- applies governance checks for owned, locked, and approval-required keys

### `globalyze watch`

Watches the source directory for new hardcoded strings, transforms changed files, and syncs locales.

Options:

- `-c, --config <path>`
- `--source-dir <path>`
- `--locales-dir <path>`

Note:

- `watch` updates source files, syncs locale files, translates new keys into target locales, and removes deleted keys from locale outputs

### `globalyze analyze`

Shows localization diagnostics in one command:

- translation coverage
- missing keys
- project score
- localization health

### `globalyze clean`

Finds unused locale keys. Use `--fix` to remove them from locale files.

### Inspection Commands

### `globalyze audit`

Runs a read-only extraction audit to show UI strings that are still left in source after globalization or sync.

Use this to catch the remaining misses, including strings in JSX, attributes, and supported UI config object properties such as sidebar titles, tab labels, and field hints.

```bash
globalyze audit
globalyze audit --fail-on-findings
```

### `globalyze inspect key <key>`

Shows the value, locale file, source origin, usages, and governance metadata for a translation key.

```bash
globalyze inspect key checkout.pay_button
```

### `globalyze inspect graph`

Shows a high-level summary of the translation graph, including total keys, page counts, component counts, and top pages.

Examples:

```bash
globalyze inspect graph
globalyze inspect graph --page checkout
globalyze inspect graph --component checkoutButton
globalyze inspect graph --visual
```

`--visual` renders a compact tree, for example:

```text
checkout.page
├ checkout.title
├ checkout.pay_button
└ checkout.cancel
```

### `globalyze classify`

Inspects per-page ownership for component files and reports which assignments are:

- route-owned
- learned from existing generated state
- shared across routes
- unresolved and likely headed for `common.*`

```bash
globalyze classify
```

To record decisions for unresolved files:

```bash
globalyze classify --fix
```

### `globalyze inspect where <key>`

Lists the source files that currently use a translation key.

```bash
globalyze inspect where checkout.pay_button
```

### `globalyze inspect locales <language> [scope]`

Reads locale entries for a language without modifying files. Works with JSON, JS, single-file, and multi-file layouts.

Examples:

```bash
globalyze inspect locales en
globalyze inspect locales en checkout
```

### `globalyze inspect search <text>`

Finds translation keys by matching source-locale values.

```bash
globalyze inspect search "Pay now"
```

### Maintenance Commands

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

### `globalyze style`

Changes the locale storage format and layout without regenerating translation keys.

Use this when you want to move between:

- single-file and multi-file locale layouts
- JSON and JavaScript locale files
- page-based and component-based multi-file splits

Options:

- `-c, --config <path>`

### `globalyze dynamic-remove`

Reverts interpolated `t(key, params)` calls back into JSX string expressions using the source locale templates.

### `globalyze duplicates`

Finds multiple translation keys that share the same source text.

### `globalyze clean`

Finds unused locale keys. Use `--fix` to remove them from locale files.

### Governance Commands

### `globalyze owner <key> <team>`

Assigns ownership metadata to a translation key.

### `globalyze lock <key>`

Locks a translation key against automatic value changes.

### `globalyze unlock <key>`

Unlocks a translation key so it can be updated again.

### `globalyze rename <oldKey> <newKey>`

Renames a translation key across source files, locale files, and the translation graph.

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

## Inspecting Translations

Globalyze includes read-only inspection commands for understanding the current localization state without rewriting code or locale files.

```bash
globalyze audit
globalyze inspect key checkout.pay_button
globalyze inspect graph
globalyze inspect where checkout.pay_button
globalyze inspect locales en
globalyze inspect locales en checkout
globalyze inspect search "Pay now"
globalyze analyze
```

Use them to answer common questions quickly:

- which file owns a key
- where a key is used
- which locale file contains a value
- whether a string is duplicated
- whether the current project has unused keys or missing coverage

### `globalyze screenshot <image>`

Runs OCR on a screenshot and flags text missing from locale files.

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
  localeStructure: {
    format: "ts",
    structure: "single",
    splitStrategy: "page",
    commonFile: false,
    naming: "dot",
    unresolvedOwnership: "common"
  },
  cacheTranslations: true,
  dynamicExtraction: false,
  i18nAdapter: "generic",
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
  translationFunctionName: "t",
  governance: {
    enabled: false,
    failOnLockedChange: true,
    failOnApprovalRequiredChange: false
  }
};
```

### Config fields

- `sourceDir`: source directory to scan
- `localesDir`: directory where per-language locale folders are stored
- `languages`: supported locales
- `ignore`: ignored directories
- `localeStructure`: file format (`json`, `js`, or `ts`), layout, and multi-file naming convention for locale output
- `localeStructure.unresolvedOwnership`: in multi-file page mode, choose whether unresolved ownership goes to `common`, `unresolved`, or standalone page-like files
- `cacheTranslations`: persist and reuse translated strings from `.globalyze/translations.json`
- `dynamicExtraction`: enable extraction and transformation of interpolated JSX strings
- `i18nAdapter`: choose a built-in runtime adapter or stay generic/custom
- `translationInstructions`: editable translation context inferred during `globalyze init` and forwarded to Lingo as per-key hints
- `sourceLocale`: canonical source locale, default `en`
- `openAiModel`: OpenAI model for key generation
- `geminiModel`: Gemini model used only when OpenAI key generation is rate-limited
- `aiBatchSize`: number of strings per key-generation batch
- `translationImportPath`: import path to inject when transforming source
- `translationFunctionName`: translation function name to call in transformed JSX
- `translationHookName`: optional custom hook name for custom adapters
- `providerImportPath`: optional provider import path for custom adapters
- `providerComponentName`: optional provider component name for custom adapters
- `governance`: enterprise review controls for locked and approval-required value changes
- `lingoApiUrl`: optional custom Lingo API base URL

## Runtime Adapters

Globalyze does not ship its own i18n runtime. It acts as:

- codemod and migration tool
- translation automation layer
- locale structure manager
- governance and CI enforcement system

Built-in adapters:

- `generic`
- `custom`
- `react-i18next`
- `next-intl`
- `react-intl`

Use `i18nAdapter` in `globalyze.config.ts` to pick the runtime shape. For custom runtimes, keep using:

- `translationImportPath`
- `translationFunctionName`
- `translationHookName`
- `providerImportPath`
- `providerComponentName`

## Automatic Runtime Setup

`globalyze init` now helps with runtime onboarding for built-in adapters.

What it can do:

- detect the project package manager from lockfiles
- offer to install the selected adapter dependency
- detect the framework runtime shape
- safely auto-wire a provider when the entry file is predictable
- fall back to `globalyze.runtime.md` when wiring would be unsafe
- scaffold `src/components/GlobalyzeLanguageSwitcher.tsx`
- scaffold `src/i18n/useLocale.tsx`
- scaffold `src/runtime/languageLabels.ts`
- inject a floating dev-only language switcher when runtime wiring is safe

Supported package manager detection order:

- `bun.lockb` → `bun`
- `pnpm-lock.yaml` → `pnpm`
- `yarn.lock` → `yarn`
- `package-lock.json` → `npm`

Supported framework detection:

- Next.js App Router
- Next.js Pages Router
- TanStack Start
- Vite React

Current auto-wiring support:

- Next.js App Router via `app/layout.tsx` or `src/app/layout.tsx`
- Vite React via `src/main.tsx` or `src/main.jsx`

If wiring is skipped, Globalyze generates [globalyze.runtime.md](/Users/bilal/Documents/globalyze/globalyze.runtime.md) with:

- adapter install guidance
- provider integration notes
- locale loading guidance
- language switcher guidance

## Automatic Language Switcher

When runtime setup runs during `globalyze init` or `globalyze globalize`, Globalyze now scaffolds:

- `src/components/GlobalyzeLanguageSwitcher.tsx`
- `src/i18n/useLocale.tsx`
- `src/runtime/languageLabels.ts`

The generated switcher:

- reads languages from `globalyze.config.ts`
- resolves readable labels such as `English`, `Français`, and `العربية`
- uses an adapter-aware `useLocale()` hook
- stays out of your production UI unless you place it yourself

If the runtime entry file is predictable and wiring is safe, Globalyze also injects a floating development-only switcher so you can test locale changes immediately.

Customize it by:

- importing `GlobalyzeLanguageSwitcher` anywhere in your own UI
- editing `src/runtime/languageLabels.ts` to override labels
- replacing the default `<select>` UI in `src/components/GlobalyzeLanguageSwitcher.tsx`

For `custom` adapters, Globalyze scaffolds a generic locale provider and leaves TODO comments in `src/i18n/useLocale.tsx` where you should connect your own runtime.

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
globalyze globalize
globalyze sync
```

## Interactive CLI

Running `globalyze` with no arguments opens a prompt-driven menu powered by `@clack/prompts`.

Available actions:

- Scan project for strings
- Globalize project
- Sync translations
- Add languages to config
- Change locale file style
- Remove dynamic translations
- Preview transformations
- Transform source code
- Generate translations
- Show duplicate translations
- Clean unused locale keys
- Watch for new strings
- Analyze screenshot
- Show translation report
- Show project score

## CI And Automation

Globalyze includes a GitHub Actions workflow at [.github/workflows/globalyze.yml](/Users/bilal/Documents/globalyze/.github/workflows/globalyze.yml).

Current workflow behavior:

- runs on `pull_request`
- installs the Globalyze CLI
- runs `globalyze sync`
- commits generated changes with `globalyze bot: add missing translations`
- pushes fixes back to the PR branch when allowed
- runs `globalyze scan --fail-on-findings`
- runs `globalyze sync --check`

Fork limitation:

- GitHub Actions cannot push fixes back to forked pull requests with the current permissions model

To use the same automation in another repository:

1. copy the workflow file into that repository
2. add a repository variable named `GLOBALYZE_INSTALL_SOURCE`
3. set it to a Bun-installable source such as `github:Bil0000/Globalyze`
4. add `globalyze.config.ts`
5. configure repository secrets such as `GLOBALYZE_OPENAI_API_KEY`, `GLOBALYZE_GEMINI_API_KEY`, and `GLOBALYZE_LINGO_API_KEY` if you want real AI keys and translations

Notes:

- the workflow does not require Globalyze to be part of the target repository
- it installs the CLI globally inside the GitHub Actions runner, then runs `globalyze ...` against the checked-out repo
- when the workflow runs inside the Globalyze repo itself, it auto-installs from the checked-out local repository
- this naming is only for GitHub Actions secrets; local CLI usage still uses `OPENAI_API_KEY`, `GEMINI_API_KEY`, and `LINGO_API_KEY`

## Demo Project

The repository includes a demo Next.js app in [examples/demo-nextjs](/Users/bilal/Documents/globalyze/examples/demo-nextjs).

The checked-in root config points to that demo:

- source: `examples/demo-nextjs/src`
- locales: `examples/demo-nextjs/locales`

That means you can try the tool immediately from the repository root.

## Locale File Structures

Globalyze always organizes locale output by language folder:

```text
locales/
  en/
  fr/
  ar/
```

### Single JSON

```text
locales/
  en/en.json
  fr/fr.json
  ar/ar.json
```

### Multiple JSON

Page-based:

```text
locales/
  en/
    checkout.page.json
    payments.page.json
    common.json
```

Supported multi-file naming conventions:

- `dot`: `pricing.page.js`
- `camel`: `pricingPage.js`
- `snake`: `pricing_page.js`
- `kebab`: `pricing-page.js`

When `splitStrategy` is `page`, unresolved ownership can be configured as:

- `common`: move unresolved entries into `common.*`
- `file`: place unresolved entries into `unresolved.*`
- `page`: keep unresolved entries in standalone page-like buckets

Component-based:

```text
locales/
  en/
    header.component.json
    cart.component.json
    common.json
```

### Single JavaScript

```text
locales/
  en/en.js
  fr/fr.js
```

JavaScript locale files export plain JavaScript objects:

```js
export const en = {
  "checkout.buy_button": "Buy now"
};
```

### Single TypeScript

```text
locales/
  en/en.ts
  fr/fr.ts
```

TypeScript locale files export typed constants:

```ts
export const en = {
  "checkout.buy_button": "Buy now"
} as const;
```

### Multiple JavaScript

```text
locales/
  en/
    checkout.page.js
    common.js
```

### Multiple TypeScript

```text
locales/
  en/
    checkout.page.ts
    common.ts
```

### Common Files

When `localeStructure.structure` is `multiple` and `commonFile` is `true`, Globalyze moves repeated values shared across pages or components into `common.json` or `common.js`.

`globalyze init` now defaults to TypeScript locale files when you choose a code-based locale format.

### Changing Style Later

Use `globalyze style` to migrate locale files after initialization. This command preserves existing keys and translations, then rewrites the locale output using the newly selected layout.

## ESLint Plugin

Globalyze includes an ESLint plugin package at [packages/eslint-plugin-globalyze](/Users/bilal/Documents/globalyze/packages/eslint-plugin-globalyze).

Rule:

- `globalyze/no-hardcoded-ui-strings`

Example config:

```json
{
  "plugins": ["globalyze"],
  "rules": {
    "globalyze/no-hardcoded-ui-strings": "warn"
  }
}
```

## Dynamic Extraction

When `dynamicExtraction` is enabled, Globalyze can transform interpolated JSX expressions such as:

```tsx
<h1>{`${user.name} added ${itemCount} items`}</h1>
```

into:

```tsx
<h1>{t("activity.items_added", { name: user.name, itemCount })}</h1>
```

with a source-locale template like:

```json
{
  "activity.items_added": "{name} added {itemCount} items"
}
```

Use `globalyze dynamic-remove` to revert those translation calls back into JSX expressions.

## Translation Cache And Graph

Globalyze maintains two cache files under the main repo root:

- `.globalyze/translations.json`
  Reuses previously translated source text per target language before calling Lingo.dev again.
- `.globalyze/translationGraph.json`
  Tracks key text, origin file, target locale file, and source usages.

The graph is refreshed during `scan`, `transform`, `globalize`, and `sync`.

## Ownership And Governance

Globalyze supports optional governance metadata per translation key:

- `owner`
- `locked`
- `approvalRequired`

Compatible locale values:

```json
{
  "checkout.pay_button": {
    "value": "Pay now",
    "owner": "payments-team",
    "locked": false,
    "approvalRequired": true
  }
}
```

Plain string locale values are still supported and remain backward-compatible.

Management commands:

- `globalyze owner <key> <team>`
- `globalyze lock <key>`
- `globalyze unlock <key>`

Governance behavior during `sync` and CI:

- locked key changes fail by default
- approval-required key changes are reported for review
- owned key changes print owner information

These defaults are controlled by `governance.enabled`, `governance.failOnLockedChange`, and `governance.failOnApprovalRequiredChange`.

## Architecture Overview

Globalyze is organized as a small set of focused modules:

- `src/scanner`
  Finds candidate source files with `fast-glob`
- `src/extractor`
  Parses files with Babel and extracts UI strings or existing translation keys
- `src/ai`
  Generates semantic keys with OpenAI and handles similarity-based key reuse
- `src/adapters`
  Resolves runtime-specific import, hook, and provider behavior
- `src/transformer`
  Rewrites JSX AST nodes and injects adapter-aware translation usage
- `src/governance`
  Evaluates locked, owned, and approval-required translation changes
- `src/i18n`
  Builds, merges, syncs, validates, and rewrites locale dictionaries through pluggable writers
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
8. update governance-aware translation graph data
9. validate/report in CI and local workflows

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
