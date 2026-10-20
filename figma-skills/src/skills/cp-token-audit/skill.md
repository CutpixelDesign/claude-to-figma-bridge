---
name: cp-token-audit
description: Checks whether the selected Figma frames use the design system — colors bound to variables, text styles applied, effects from effect styles, radii and stroke widths bound to tokens where such tokens exist, semantic tokens used instead of primitives. Reports numbered issues in the chat and fixes only the ones the user picks. Use when the user asks to check tokens, variables, styles or hardcoded values ("применены ли токены", "проверь переменные", "найди захардкоженные цвета", "проверь стили текста").
---

# Token audit

Check that the selected frames take their colors, typography, effects, radii and strokes from the design system, report numbered issues, and fix only the ones the user picks.

<!-- @include shared/other-skills.md -->

## Workflow

<!-- @include shared/audit-workflow.md -->

## Checks

<!-- @include shared/checks/tokens.md -->

## Fixing

<!-- @include shared/fixing.md -->

## Rules

<!-- @include shared/core-rules.md -->

<!-- @include shared/bridge.md -->

<!-- @include shared/report-format.md -->
