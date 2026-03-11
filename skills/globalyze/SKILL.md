---
name: globalyze
description: Use the Globalyze CLI to internationalize, maintain, debug, and runtime-wire React applications, including first-time globalization, ongoing sync, locale style changes, ownership classification, extraction audits, grouped inspection, and localization health analysis.
---

# Globalyze

Use this skill when the user wants an app localized, maintained, debugged, or runtime-wired with the Globalyze CLI.

## What This Skill Does

- Initializes Globalyze config when missing
- Globalizes non-i18n projects
- Syncs existing localized projects
- Handles runtime setup and generated runtime artifacts
- Changes locale file structure safely
- Resolves page/component ownership with `classify`
- Audits missed extraction coverage with `audit`
- Analyzes localization health with `analyze`
- Inspects keys, locales, graph state, usages, and search results with grouped `inspect`
- Helps agents choose the right Globalyze command instead of hand-editing locale data

## Working Rules

- Prefer Globalyze CLI commands over ad-hoc file edits
- Treat `globalize` as first-time migration
- Treat `sync` as ongoing maintenance
- Use `sync --check` for translation coverage validation
- Use `sync --translate-only` only when the user wants locale translation without source maintenance
- Use `globalize --no-translate` or `sync --no-translate` when the user wants locale/source updates without translation work
- Use `style` only for locale file reorganization
- Use `audit` after `globalize` or `sync` if extraction coverage looks incomplete
- Use `classify` before per-page output when ownership looks ambiguous
- Use `analyze` for coverage + score + doctor-style health reporting
- Use grouped `inspect` commands instead of hand-reading many locale/graph files
- Reuse generated runtime files and `globalyze.runtime.md` instead of inventing a second i18n architecture
- When runtime wiring is skipped, give the agent both `globalyze.runtime.md` and the real entry file (`layout.tsx`, `_app.tsx`, `main.tsx`, `__root.tsx`, etc.)
- Do not hand-edit locale files unless the user explicitly asks

## Recommended Workflow

1. Confirm the project root and check for `globalyze.config.ts`
2. If config is missing, run `globalyze init`
3. If the project is not yet localized, run `globalyze globalize`
4. If the project is already localized, run `globalyze sync`
5. If locale grouping is ambiguous in page mode, run:
   - `globalyze classify`
   - `globalyze classify --fix`
6. If runtime wiring was skipped, read `globalyze.runtime.md` and inspect generated runtime files
7. If the user wants a different locale layout, run `globalyze style`
8. If extraction coverage looks incomplete, run `globalyze audit`
9. For debugging or review, use:
   - `globalyze analyze`
   - `globalyze inspect key <key>`
   - `globalyze inspect where <key>`
   - `globalyze inspect search <text>`
   - `globalyze inspect locales <language> [scope]`
   - `globalyze inspect graph --visual`

## Command Guide

### First-time setup

```bash
globalyze init
globalyze globalize
```

### Existing project maintenance

```bash
globalyze sync
globalyze sync --check
globalyze sync --translate-only
```

### Runtime and onboarding

```bash
globalyze init
globalyze globalize
```

Look for these generated files before building anything manually:
- `src/i18n.ts`
- `src/i18n/runtime.ts` or `src/i18n/runtime.js`
- `src/i18n/useLocale.ts` or `src/i18n/useLocale.tsx`
- `src/components/GlobalyzeLanguageSwitcher.tsx` or `.jsx`
- `src/runtime/languageLabels.ts` or `.js`
- `src/lib/i18n/translations.generated.ts` or `.js`
- `globalyze.runtime.md`

### Ownership and page/component debugging

```bash
globalyze classify
globalyze classify --fix
globalyze inspect graph --visual
```

### Locale layout changes

```bash
globalyze style
```

### Extraction coverage and missed strings

```bash
globalyze audit
globalyze audit --fail-on-findings
```

### Analysis and inspection

```bash
globalyze analyze
globalyze inspect key checkout.pay_button
globalyze inspect where checkout.pay_button
globalyze inspect locales en
globalyze inspect search "Pay now"
globalyze inspect graph --visual
```

### Maintenance and cleanup

```bash
globalyze duplicates
globalyze clean
globalyze clean --fix
globalyze rename old.key new.key
globalyze dynamic-remove
globalyze watch
```

### Governance

```bash
globalyze owner checkout.pay_button payments-team
globalyze lock checkout.pay_button
globalyze unlock checkout.pay_button
```

## Output Expectations

When using this skill:

- explain whether the project needs `globalize`, `sync`, `style`, `audit`, or `analyze`
- call out ownership issues if page grouping is uncertain
- mention generated or refreshed runtime files such as `translations.generated.ts`
- mention `globalyze.runtime.md` when runtime wiring was skipped or needs manual completion
- prefer `useTranslation()` / `useLocale()` runtime patterns over static `t()` imports for reactive client UI
- mention `sync --check` when the user is asking for CI coverage validation
- mention `globalize --no-translate` or `sync --no-translate` when the user wants structural changes without translation calls
- summarize the commands run and the resulting file/layout changes
