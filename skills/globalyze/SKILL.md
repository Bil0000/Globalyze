---
name: globalyze
description: Use the Globalyze CLI to internationalize React, Next.js, and TanStack Start applications, including first-time globalization, runtime setup, ongoing sync, locale style changes, ownership classification, extraction audits, and translation inspection.
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
- Inspects keys, locales, graph state, and translation health
- Helps agents choose the right Globalyze command instead of hand-editing locale data

## Working Rules

- Prefer Globalyze CLI commands over ad-hoc file edits
- Treat `globalize` as first-time migration
- Treat `sync` as ongoing maintenance
- Use `style` only for locale file reorganization
- Use `audit` after `globalize` or `sync` if extraction coverage looks incomplete
- Use `classify` before per-page output when ownership looks ambiguous
- Reuse generated runtime files and `globalyze.runtime.md` instead of inventing a second i18n architecture
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
8. If extraction coverage looks incomplete, run:
   - `globalyze audit`
9. For debugging or review, use:
   - `globalyze inspect <key>`
   - `globalyze graph`
   - `globalyze doctor`

## Command Guide

### First-time setup

```bash
globalyze init
globalyze globalize
```

### Existing project maintenance

```bash
globalyze sync
```

### Runtime and onboarding

```bash
globalyze init
globalyze globalize
```

Look for these generated files before building anything manually:
- `src/i18n.ts`
- `src/i18n/useLocale.ts` or `src/i18n/useLocale.tsx`
- `src/components/GlobalyzeLanguageSwitcher.tsx`
- `src/runtime/languageLabels.ts`
- `src/lib/i18n/translations.generated.ts`
- `globalyze.runtime.md`

### Ownership and page/component debugging

```bash
globalyze classify
globalyze classify --fix
globalyze graph --visual
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

### Inspection

```bash
globalyze inspect checkout.pay_button
globalyze where checkout.pay_button
globalyze locales en
globalyze search "Pay now"
globalyze doctor
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

- explain whether the project needs `globalize`, `sync`, `style`, or `audit`
- call out ownership issues if page grouping is uncertain
- mention generated or refreshed runtime files such as `translations.generated.ts`
- mention `globalyze.runtime.md` when runtime wiring was skipped or needs manual completion
- prefer `useTranslation()` / `useLocale()` runtime patterns over static `t()` imports for reactive client UI
- summarize the commands run and the resulting file/layout changes
