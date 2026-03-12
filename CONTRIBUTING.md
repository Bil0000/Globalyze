# Contributing to Globalyze

Globalyze is a Bun + TypeScript CLI that internationalizes React applications with AST transforms, semantic key generation, locale synchronization, runtime scaffolding, and CI tooling.

This guide is for contributors working on the Globalyze repository itself.

## Project Goals

Globalyze is designed to:

- extract UI strings from real React codebases with high accuracy
- generate stable, meaningful translation keys
- keep locale files synchronized with source code
- automate runtime setup for mainstream frameworks where it is safe
- stay fast and resource-friendly on large projects
- prefer safe fallbacks and guidance over risky code generation

When contributing, optimize for:

- correctness first
- predictable behavior across repeated runs
- maintainable generated code
- minimal surprise for users running `globalize` and `sync`

## Requirements

- [Bun](https://bun.sh/) `>= 1.2.20`
- Git

## Development Setup

Clone the repo and install dependencies:

```bash
git clone https://github.com/Bil0000/Globalyze.git
cd globalyze
bun install
```

Run the CLI from source:

```bash
bun run globalyze --help
```

If you want the local checkout to be available as `globalyze` globally during development:

```bash
bun link
```

After that:

```bash
globalyze --help
```

Important:

- if you are using `bun link`, `globalyze update` will detect that linked setup
- it will not replace your linked checkout with the GitHub-installed package
- update the local repo directly instead:

```bash
git pull
bun link
```

## Global Install vs Linked Development

Globalyze supports two main install modes:

### Recommended user install

Install the published CLI directly from GitHub:

```bash
bun add -g github:Bil0000/Globalyze
```

Check for CLI updates:

```bash
globalyze update --check
```

Install the latest CLI update:

```bash
globalyze update
```

### Maintainer / contributor install

Use the cloned repo with:

```bash
bun link
```

In that mode, `globalyze update` will not overwrite your linked CLI. It will tell you to update the repo itself.

## Environment Variables

Globalyze loads `.env` and `.env.local` from the Globalyze repo root or installed package root.

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

- a single OpenAI key
- multiple OpenAI keys via `OPENAI_API_KEYS` or `OPENAI_API_KEY_2`, `OPENAI_API_KEY_3`, etc.
- a single Gemini key
- multiple Gemini keys via `GEMINI_API_KEYS` or `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, etc.

Key-generation fallback order:

1. first OpenAI key
2. next OpenAI keys
3. first Gemini key
4. next Gemini keys
5. deterministic fallback keys

## Common Commands

### Repository validation

```bash
bun run lint
./node_modules/.bin/tsc --noEmit
bun test
```

### Running the CLI locally

```bash
bun run globalyze init
bun run globalyze globalize
bun run globalyze sync
```

### Demo app workflow

The repo includes a demo Next.js app under `examples/demo-nextjs`.

The root `globalyze.config.ts` points at that app, so from the repo root you can run:

```bash
bun run globalyze scan
bun run globalyze globalize
bun run globalyze sync
bun run globalyze audit
```

## CLI Command Model

Current high-level commands:

- `init`
- `globalize`
- `sync`
- `watch`
- `scan`
- `audit`
- `preview`
- `analyze`
- `inspect ...`
- `style`
- `add`
- `clean`
- `duplicates`
- `rename`
- `dynamic-remove`
- `classify`
- `owner`
- `lock`
- `unlock`
- `screenshot`
- `update` / `upgrade`

Key workflows:

- `globalize`: first-time migration for a non-internationalized project
- `sync`: ongoing maintenance for an already-globalized project
- `audit`: read-only extraction coverage check
- `update`: update the globally installed CLI from GitHub

## Architecture Overview

Globalyze is organized around a few major layers:

### 1. Extraction and planning

Responsible for:

- source discovery
- hardcoded string extraction
- dynamic extraction
- metadata and ownership inference
- planning key generation and transforms

Key areas:

- `src/extractor/`
- `src/utils/nameResolver.ts`
- `src/cli/pipeline.ts`

### 2. Key generation

Responsible for:

- AI semantic key generation
- fallback deterministic keys
- reuse of existing keys
- OpenAI/Gemini failover and key rotation

Key area:

- `src/ai/`

### 3. AST transforms

Responsible for:

- rewriting source code to use translation calls
- injecting imports/hooks
- generating safe sidecar files where needed

Key area:

- `src/transformer/`

### 4. Locale management

Responsible for:

- locale file creation and synchronization
- single-file and multi-file structures
- JSON / JS / TS output
- translation coverage checks

Key areas:

- `src/i18n/`
- `src/i18n/writers/`

### 5. Runtime integration

Responsible for:

- adapter resolution
- package manager detection
- framework detection
- runtime provider wiring
- generated runtime artifacts
- generated translation manifest
- language switcher scaffolding

Key areas:

- `src/adapters/`
- `src/runtime/`
- `src/utils/packageManager.ts`
- `src/utils/frameworkDetection.ts`

### 6. Project state and inspection

Responsible for:

- `.globalyze/` state
- translation graph
- cache
- ownership classification
- diagnostics and inspection commands

Key areas:

- `src/state/`
- `src/graph/`
- `src/cache/`
- `src/inspection/`

## Runtime Philosophy

Globalyze should fully automate runtime setup for mainstream, predictable setups where it is safe.

Examples:

- Next.js App Router
- Next.js Pages Router
- Vite React
- Remix
- TanStack Start
- React Router style entrypoints

For custom or ambiguous setups:

- do not guess
- generate clear fallback guidance in `globalyze.runtime.md`
- generate reusable runtime files when safe
- keep the remaining manual work minimal

The product goal is that for mainstream cases, the developer should mainly only need to decide where to place the language switcher in the UI.

## Performance Expectations

When contributing, avoid changes that make the CLI heavier without clear value.

Priorities:

- keep first-run `globalize` reasonable on large projects
- keep repeat `sync` and `audit` runs fast
- avoid unnecessary full-project reparsing
- bound concurrency for laptops and low-resource environments
- do not rescan generated runtime artifacts as user source
- do not add network calls that block normal commands unless they are essential

If you change performance-sensitive code:

- explain the tradeoff in your PR
- call out whether the change affects first-run cost, repeat-run cost, or memory use

## Accuracy Expectations

Globalyze is judged heavily on extraction and runtime correctness.

When contributing:

- prefer conservative logic to risky heuristics
- do not broaden extraction rules without matching transform support
- avoid false positives in generic config/date-format/style objects
- preserve page/component ownership correctness
- keep generated runtime files aligned with the actual manifest contract

If you add extraction coverage:

- add tests for the new pattern
- add tests that nearby non-UI patterns are *not* extracted

## Generated Code Standards

Generated code should:

- be valid for the target project language (`.ts`, `.tsx`, `.js`, `.jsx`)
- use the project’s formatting conventions when possible
- avoid hydration bugs and server/client drift
- align with the selected adapter/runtime contract
- stay consistent across `globalize`, `sync`, and `style`

Do not generate:

- invalid JSON rewritten into JS
- TypeScript-only syntax in `.js` output
- runtime files that disagree with `translations.generated.*`

## Testing Requirements

At minimum, after behavior changes:

```bash
bun run lint
./node_modules/.bin/tsc --noEmit
bun test
```

For targeted work, run the relevant test files too.

Examples:

```bash
bun test tests/updateCommands.test.ts
bun test tests/runtimeSetup.test.ts
bun test tests/stringExtractor.test.ts
bun test tests/syncCommands.test.ts
```

When adding a feature or fixing a regression:

- add or update tests
- prefer regression tests for real failures
- keep fixtures small and explicit

## Documentation Requirements

Update documentation when behavior changes:

- `README.md` for user-facing behavior
- this file for contributor-facing workflow or expectations
- generated guidance references if runtime behavior changes materially

Examples of behavior that should update docs:

- CLI command changes
- install/update workflow changes
- adapter/runtime support changes
- locale structure changes
- AI fallback behavior changes

## Pull Request Expectations

A good PR should:

- explain the user-visible problem
- explain the implementation approach
- call out tradeoffs if any
- mention affected commands / runtime flows
- mention validation performed

If the change affects generated output or runtime behavior, include:

- the expected before/after behavior
- any framework-specific notes

## Contribution Tips

- Prefer small, composable modules over pushing more logic into large command files.
- Reuse existing helpers and config resolution rather than adding parallel flows.
- Treat `globalize` as the first-time migration contract.
- Treat `sync` as the long-term maintenance contract.
- Keep those two commands stable and internally consistent.

## Need Help?

Start with:

- [README.md](/Users/bilal/Documents/globalyze/README.md)
- the command modules in `src/commands/`
- the test files covering the area you are changing

If you are changing runtime behavior, inspect:

- `src/runtime/`
- `src/adapters/`
- `tests/runtimeSetup.test.ts`
- `tests/runtimeManifest.test.ts`
- `tests/syncCommands.test.ts`
