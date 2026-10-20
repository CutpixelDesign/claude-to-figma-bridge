---
name: cp-color-themes
description: Creates or changes color themes for the selected Figma designs — adds light/dark (or other) modes to color variables, generates the counterpart palette, shifts the hue or tone of a palette, applies the right mode to frames and checks contrast. Use when the user asks for dark mode, light mode, a new theme, a recolor or a change of color tone ("сделай тёмную тему", "добавь dark mode", "поменяй цветовой тон", "перекрась", "новая цветовая схема").
---

# Color themes

Add theme modes or shift the color tone of the selected designs through variables.

## Prerequisites

Themes work through semantic color variables with modes (see *Token tiers* below). Check that the selected designs are bound to them first.
<!-- TODO: что делать, если цвета захардкожены или привязаны к примитивам?
  Figma вызывает только один скил на промпт, поэтому сослаться на /cp-ds-from-design нельзя —
  либо минимально создать семантику здесь, либо остановиться и попросить запустить его отдельно. -->

## Light / Dark

<!-- TODO:
- не инверсия: как строить тёмную палитру (поверхности светлеют с elevation, снижение насыщенности, брендовые цвета)?
- какие токены зависят от режима, какие нет
- тени в тёмной теме
- картинки, иллюстрации, логотипы
- в каком цветовом пространстве считать (OKLCH?)
-->

## Hue / tone shift

<!-- TODO:
- что меняем: примитивы (поворот hue с сохранением lightness/chroma) или добавляем новый режим/бренд?
- нейтральные цвета: тонировать под новый тон?
- статусные цвета (success, error, warning) — не трогать по умолчанию?
- перезаписывать текущую палитру или создавать новую рядом?
-->

## Applying to designs

<!-- TODO:
- выставлять explicit mode на фреймах?
- делать копию фрейма для сравнения side-by-side?
-->

## Contrast check

<!-- TODO: WCAG AA (4.5:1 текст, 3:1 крупный текст и UI)? Что делать с провалами — чинить автоматически или сообщать? -->

## Rules

<!-- @include shared/core-rules.md -->

## Shared conventions

<!-- @include shared/token-architecture.md -->

<!-- @include shared/report-format.md -->
