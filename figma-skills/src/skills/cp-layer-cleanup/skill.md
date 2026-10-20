---
name: cp-layer-cleanup
description: Checks the layer structure of the selected Figma frames — invisible strokes and fills that still affect layout, fractional positions and sizes, hidden layers, empty frames, detached instances, and redundant nesting (wrappers whose job can move to the child or parent). Reports numbered issues in the chat and fixes only the ones the user picks, keeping the screen visually identical. Use when the user asks to clean up layers, simplify nesting, remove extra wrappers or find leftovers ("почисти слои", "убери лишнюю вложенность", "лишние фреймы", "проверь структуру слоёв").
---

# Layer cleanup

Check the layer structure of the selected frames, report numbered issues, and fix only the ones the user picks — the screen must look the same afterwards.

<!-- @include shared/other-skills.md -->

## Workflow

<!-- @include shared/audit-workflow.md -->

## Checks

<!-- @include shared/checks/cleanup.md -->

## Fixing

<!-- @include shared/fixing.md -->

## Rules

<!-- @include shared/core-rules.md -->

<!-- @include shared/bridge.md -->

<!-- @include shared/report-format.md -->
