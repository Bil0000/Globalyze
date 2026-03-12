# Globalyze

Globalyze is a Bun + TypeScript CLI that internationalizes React applications with AST-based source transforms, AI-assisted key generation, runtime wiring, locale management, and translation automation.

It is built to take a project from hardcoded UI strings to a working, maintainable localization system with as little manual work as possible.

## Install

Recommended install:

```bash
bun add -g github:Bil0000/Globalyze
```

Verify the CLI:

```bash
globalyze --help
```

Update later:

```bash
globalyze update
```

Check for updates only:

```bash
globalyze update --check
```

## Quick Start

Initialize the project:

```bash
globalyze init
```

Run the first-time migration:

```bash
globalyze globalize
```

Keep the project in sync afterward:

```bash
globalyze sync
```

## What Globalyze Uses

Globalyze is not just a key replacer. The current stack is:

- `Bun` for the CLI runtime and package workflow
- `TypeScript` for the codebase
- `Babel AST` analysis and transforms for source extraction and rewriting
- `OpenAI` for semantic translation key generation
- `Gemini` as an AI fallback for key generation
- `Lingo.dev` for locale translation

### Lingo.dev Integration

Globalyze uses Lingo.dev as the translation provider for target locales. It sends source-locale dictionaries to Lingo and receives translated locale payloads back, while preserving Globalyze’s own locale structure and runtime conventions.

In practice, Globalyze uses Lingo.dev for:

- translating generated locale keys into target languages
- preserving structured locale objects during translation
- re-running translation on incremental project updates
- keeping translation automation inside `globalize` and `sync`

If Lingo.dev is temporarily unavailable, Globalyze warns clearly in the terminal and falls back to English source values until the service recovers.

## Why Globalyze

- Automatic source extraction from React/Next.js-style codebases
- Semantic key generation instead of raw string hashes
- Runtime adapter support for mainstream React app architectures
- Locale file generation in JSON, JS, or TS formats
- Per-page, per-component, or shared locale organization
- Incremental sync workflows for large projects
- Audit, inspection, ownership, locking, and cleanup tooling
- OCR-based screenshot review for missing strings
- AI skill support for agent workflows
- Built-in update checks and one-command upgrades

## Visual Placeholders

Add visuals in these spots later.

### Placeholder 1: Hero Demo

Recommended visual:
- short GIF or screenshot showing a React file before `globalize` and after `globalize`
- include generated locale files beside the transformed source

### Placeholder 2: CLI Workflow

Recommended visual:
- terminal screenshot of:
  - `globalyze init`
  - `globalyze globalize`
  - `globalyze sync`

### Placeholder 3: Runtime Wiring

Recommended visual:
- screenshot of generated runtime files:
  - `src/i18n.ts`
  - `src/i18n/useLocale.*`
  - `src/components/GlobalyzeLanguageSwitcher.*`
  - `src/lib/i18n/translations.generated.*`

### Placeholder 4: Audit / Analyze

Recommended visual:
- split screenshot of:
  - `globalyze audit`
  - `globalyze analyze`

### Placeholder 5: In-App Result

Recommended visual:
- app UI showing:
  - translated interface
  - generated language switcher
  - per-page translated content

## Supported App Setups

Globalyze is built around mainstream React application structures, including:

- Next.js App Router
- Next.js Pages Router
- Vite React
- Remix
- TanStack Start
- React Router-style SPAs
- plain React entry-point apps

Runtime adapters currently supported:

- `generic`
- `custom`
- `react-i18next`
- `next-intl`
- `react-intl`

## Installation Options

### Recommended: Global CLI from GitHub

```bash
bun add -g github:Bil0000/Globalyze
```

This is the default install path for normal users.

### Development / Maintainer Workflow

If you are working on Globalyze itself:

```bash
git clone https://github.com/Bil0000/Globalyze.git
cd globalyze
bun install
bun link
```

This links your local checkout into your shell as the `globalyze` command.

Note:
- `globalyze update` is for global GitHub installs
- if you are using `bun link`, update your local repo normally with Git

## Environment Variables

Globalyze uses its own `.env` file at the Globalyze repo or package root.

Example:

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_API_KEY_2=your_second_openai_key
GEMINI_API_KEY=your_gemini_key
GEMINI_API_KEY_2=your_second_gemini_key
LINGO_API_KEY=your_lingo_key
```

### AI Key Rotation

Globalyze supports multiple AI keys.

Order used for semantic key generation:

1. `OPENAI_API_KEY`
2. `OPENAI_API_KEY_2`
3. `OPENAI_API_KEY_3`
4. then Gemini fallback keys in the same order

If all provider keys are rate-limited, Globalyze falls back to deterministic key generation.

## Core Workflow

### 1. Initialize

```bash
globalyze init
```

What it does:

- detects likely project languages
- asks for runtime adapter
- configures locale structure
- offers runtime wiring
- generates language switcher/runtime helper files
- creates `globalyze.config.ts`

### 2. Globalize the Project

```bash
globalyze globalize
```

What it does:

- scans the codebase
- extracts UI strings
- generates translation keys
- rewrites source code to translation calls
- creates locale files
- translates target locales
- refreshes runtime manifests
- runs a post-migration audit summary

### 3. Keep It Updated

```bash
globalyze sync
```

What it does:

- finds newly added strings
- updates locale files
- fills missing translations
- refreshes runtime artifacts
- updates the translation graph
- runs a post-sync audit summary

## Command Reference

### Primary Commands

#### `globalyze init`

Creates `globalyze.config.ts` and prepares the project for localization.

#### `globalyze globalize`

Runs the first-time end-to-end migration for a non-internationalized project.

Useful flags:

- `--no-translate`

#### `globalyze sync`

Runs the incremental maintenance flow for an already-globalized project.

Useful flags:

- `--check`
- `--translate-only`
- `--no-translate`

#### `globalyze watch`

Watches the project and keeps locale state updated as files change.

#### `globalyze analyze`

Runs the combined analysis view for:

- translation coverage
- project score
- overall localization health

#### `globalyze audit`

Reports any extractable UI strings that Globalyze still missed after migration.

#### `globalyze scan`

Read-only pre-migration scan for hardcoded UI strings.

#### `globalyze preview`

Shows planned transforms without writing files.

### Inspection Commands

#### `globalyze inspect key <key>`

Shows detailed information for one translation key.

#### `globalyze inspect where <key>`

Shows where a translation key is used in source.

#### `globalyze inspect search <text>`

Searches translation values and related keys.

#### `globalyze inspect locales <language> [scope]`

Shows locale entries for a language, optionally filtered by scope.

#### `globalyze inspect graph`

Shows translation graph information.

Useful flags:

- `--page <name>`
- `--component <name>`
- `--visual`

### Maintenance Commands

#### `globalyze style`

Changes locale file structure, naming, and format without regenerating keys.

#### `globalyze add <codes...>`

Adds one or more languages to the project and syncs locale output.

Example:

```bash
globalyze add tr de
```

#### `globalyze clean`

Finds unused locale keys.

Useful flags:

- `--fix`

#### `globalyze duplicates`

Finds duplicate source-text / translation-key situations.

#### `globalyze rename <oldKey> <newKey>`

Renames a translation key across source, locales, and graph state.

#### `globalyze dynamic-remove`

Reverts dynamic translation transforms back to plain expressions.

### Ownership / Governance Commands

#### `globalyze classify`

Shows route/page/component ownership classification and can persist decisions for unresolved ownership.

Useful flags:

- `--fix`

#### `globalyze owner <key> <team>`

Assigns ownership metadata to a translation key.

#### `globalyze lock <key>`

Locks a translation key against automatic value changes.

#### `globalyze unlock <key>`

Unlocks a previously locked translation key.

### Utility Commands

#### `globalyze screenshot <image>`

Runs OCR on a screenshot and reports untranslated or missing UI text.

#### `globalyze update`

Updates the globally installed CLI from GitHub.

Alias:

- `globalyze upgrade`

Useful flags:

- `--check`

## Common Workflows

### Global Install and First Migration

```bash
bun add -g github:Bil0000/Globalyze
cd your-app
globalyze init
globalyze globalize
```

### Ongoing Maintenance

```bash
globalyze sync
```

### Validate Translation Coverage

```bash
globalyze sync --check
```

### Translation-Only Refresh

```bash
globalyze sync --translate-only
```

### Change Locale Style

```bash
globalyze style
```

### Inspect a Key

```bash
globalyze inspect key dashboard.sidebar.nav.quick_create
```

### Analyze Project Health

```bash
globalyze analyze
```

### Audit Remaining Strings

```bash
globalyze audit
```

## Automatic Runtime Setup

Globalyze can scaffold and wire runtime localization for mainstream React app structures.

Depending on framework and adapter, it can generate or refresh:

- `src/i18n.ts`
- `src/i18n/useLocale.tsx` or `.jsx`
- `src/i18n/runtime.ts` or `.js`
- `src/components/GlobalyzeLanguageSwitcher.tsx` or `.jsx`
- `src/runtime/languageLabels.ts` or `.js`
- `src/lib/i18n/translations.generated.ts` or `.js`

If runtime wiring is not safe to perform automatically, Globalyze generates:

- `globalyze.runtime.md`

That file is designed to be usable by both developers and AI agents.

## Automatic Language Switcher

Globalyze can generate:

- `GlobalyzeLanguageSwitcher`
- locale hooks
- language label helpers
- a development floating switcher when safe

You can then place the switcher anywhere you want in the app UI.

## Performance Notes

Globalyze is optimized for large codebases:

- extraction caching in `.globalyze`
- bounded concurrency for lower-resource machines
- incremental sync workflows
- reuse of existing locale values where safe
- generated-artifact exclusion from normal source scanning

The first `globalize` run is still the heaviest operation. Later `sync` runs are significantly lighter.

## Update Behavior

Globalyze checks for updates automatically during normal CLI usage.

- update checks are cached
- GitHub release notes or recent commit summaries are shown when available
- linked development installs are detected and handled differently from GitHub-installed CLI packages

Manual update commands:

```bash
globalyze update
globalyze update --check
globalyze upgrade
```

## AI Skill

Globalyze ships with an AI skill for agent workflows.

Skill install example:

```bash
npx skills add Bil0000/Globalyze --skill globalyze
```

This is useful for Cursor, Codex, Claude-style agents, or any workflow where an AI should use the CLI correctly.

## Stability Notes

Globalyze is designed to automate as much as possible, but the hardest part of any localization system is still runtime integration across many frameworks and project shapes.

The strongest supported path is:

- mainstream React app structure
- supported adapter
- managed Globalyze runtime files

For highly custom setups, Globalyze falls back to explicit guidance instead of risky edits.

## Development

For contribution and maintainer instructions, see:

- [CONTRIBUTING.md](/Users/bilal/Documents/globalyze/CONTRIBUTING.md)

## License

MIT
