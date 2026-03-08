---
name: globalyze
description: Use the Globalyze CLI to internationalize React, Next.js, and TanStack Start applications, including first-time globalization, ongoing sync, locale style changes, ownership classification, and translation inspection.
---

# Globalyze

Use this skill when the user wants an app localized or maintained with the Globalyze CLI.

## What This Skill Does

- Initializes Globalyze config when missing
- Globalizes non-i18n projects
- Syncs existing localized projects
- Changes locale file structure safely
- Resolves page/component ownership with `classify`
- Inspects keys, locales, graph state, and translation health

## Working Rules

- Prefer Globalyze CLI commands over ad-hoc file edits
- Treat `globalize` as first-time migration
- Treat `sync` as ongoing maintenance
- Use `style` only for locale file reorganization
- Use `classify` before per-page output when ownership looks ambiguous
- Do not hand-edit locale files unless the user explicitly asks

## Recommended Workflow

1. Confirm the project root and check for `globalyze.config.ts`
2. If config is missing, run `globalyze init`
3. If the project is not yet localized, run `globalyze globalize`
4. If the project is already localized, run `globalyze sync`
5. If locale grouping is ambiguous in page mode, run:
   - `globalyze classify`
   - `globalyze classify --fix`
6. If the user wants a different locale layout, run `globalyze style`
7. For debugging or review, use:
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

### Inspection

```bash
globalyze inspect checkout.pay_button
globalyze where checkout.pay_button
globalyze locales en
globalyze doctor
```

## Output Expectations

When using this skill:

- explain whether the project needs `globalize`, `sync`, or `style`
- call out ownership issues if page grouping is uncertain
- mention any generated or refreshed runtime files such as `translations.generated.ts`
- summarize the commands run and the resulting file/layout changes
