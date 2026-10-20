---
name: cp-frame-audit
description: Full audit of the selected Figma frames in one run — responsiveness and constraints, paddings and gaps, layer names, layer structure, and design-system usage (colors, text styles, effects, radii, strokes). Reports numbered issues in the chat and fixes only the ones the user picks. Use when the user asks for a complete or full audit ("полный аудит", "проверь всё", "full audit"). For a single area prefer its dedicated skill — cp-layout-audit, cp-spacing-audit, cp-layer-naming, cp-layer-cleanup, cp-token-audit.
---

# Frame audit

Run every check at once on the selected frames, report numbered issues, and fix only the ones the user picks.

## Workflow

<!-- @include shared/audit-workflow.md -->

## Checks

<!-- @include shared/checks/layout.md -->

<!-- @include shared/checks/spacing.md -->

<!-- @include shared/checks/naming.md -->

<!-- @include shared/checks/cleanup.md -->

<!-- @include shared/checks/tokens.md -->

## Fixing

<!-- @include shared/fixing.md -->

## Rules

<!-- @include shared/core-rules.md -->

<!-- @include shared/bridge.md -->

<!-- @include shared/report-format.md -->
