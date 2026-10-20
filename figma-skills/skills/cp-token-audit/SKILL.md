---
name: cp-token-audit
description: Checks whether the selected Figma frames use the design system — colors bound to variables, text styles applied, effects from effect styles, radii and stroke widths bound to tokens where such tokens exist, semantic tokens used instead of primitives. Reports numbered issues in the chat and fixes only the ones the user picks. Use when the user asks to check tokens, variables, styles or hardcoded values ("применены ли токены", "проверь переменные", "найди захардкоженные цвета", "проверь стили текста").
---

# Token audit

Check that the selected frames take their colors, typography, effects, radii and strokes from the design system, report numbered issues, and fix only the ones the user picks.

Each audit skill covers one area. If the user asks about another one, point them to its skill instead of checking it here:
- `/cp-layout-audit` — responsiveness: resizing, min / max, constraints, auto layout;
- `/cp-spacing-audit` — paddings and gaps;
- `/cp-layer-naming` — layer names;
- `/cp-layer-cleanup` — structure: invisible leftovers, fractional values, hidden, empty and detached layers, redundant nesting;
- `/cp-token-audit` — colors, text styles, effects, radii and strokes bound to the design system;
- `/cp-frame-audit` — all of the above at once.

## Workflow

1. Read the selection with the snapshot script (see *Working with Figma*). If nothing is selected, see *Scope*.
2. Run every check of this skill on every layer of the snapshot.
3. Report the issues in the chat (see *Report format*). Change nothing at this step.
4. Wait for the user to pick which issues to fix, then fix them through the bridge (see Fixing).

## Checks

### Design-system compliance

First find the design system the file uses: local variables and styles, and every enabled library. Take its conventions — collection names, token naming, groups — from the file itself; never impose a structure of your own. Spacing is a separate check.

- **No design system** — no local variables or styles and no enabled libraries: there is nothing to check against. Tell the user so and stop; don't audit.
- **Several libraries** — the design system is all of them together with the local variables and styles. A design may legitimately take styles and tokens from different libraries; a binding to any of them is valid. Check everything that can be checked.
- **Partial design system** — check each kind of value only if the system has something for it: no text styles means no text-style check, no radius tokens means no radius check.

- **Bindings outside the current design system.** Check every bound variable by identity, not by name: it must belong to a collection of the file's current design system (or an enabled library). A binding to a deleted variable, or to a leftover collection from an older system, is an error — even when its name matches a current token. Names can collide while values differ: an old `Radius/md` = 12 next to the current `Radius/md` = 24. Suggest the current token; if the values differ, the rebinding is a value change the user must accept. In the snapshot such bindings are marked `[stale: Collection]`.
- **Colors.** Fills and strokes are bound to color variables or color styles. A hardcoded color is an error; suggest the nearest token. Colors are compared exactly, with no tolerance: `#1B1B1B` next to a `#1A1A1A` token is a different color and is reported.
- **Text.** Every text layer has a text style. Text without a style, or with a property overridden by a hardcoded value (font weight 400 instead of the weight token), is an error.
- **Effects.** Shadows and blurs come from effect styles. If the file has no effect styles at all, report hardcoded effects as Info.
- **Radius.** If radius tokens exist, every radius is bound to one; a value that has no matching token is reported as off-system. If there are no radius tokens, skip radii.
- **Stroke width.** If a stroke-width variable exists but a stroke doesn't use it, report it. If there is none, skip stroke widths.
- **Opacity** set on a layer instead of an alpha in the color token is fine — don't report it.
- **Primitive instead of semantic.** Layers should be bound to semantic tokens, not to primitives. Report a binding to a primitive and suggest the semantic token that resolves to the same value. Recognize a primitive by:
  - its scopes hide it from property pickers;
  - its collection is named like a base layer (`Primitives`, `Core`, `Base`, `Palette`, `Theme` holding `--primary`-style values);
  - its name is a raw scale step or a raw value (`blue/500`, `gray/100`, `space/16`, `--primary`);
  - it holds a raw value and other variables alias it. This sign is weak on its own: in a three-tier system, semantic tokens (`UI/text-primary`) also hold raw values and are aliased by component tokens.

  One sign alone is a hint; say how sure you are.
- **Wrong token group.** A value bound to a token from an unrelated group — a title font-weight token on body text, while a content token with the same value exists — is Info: it works today but breaks when the groups diverge.
- **Consistency.** Similar elements share stroke weight, radius and colors. Compare within the same context: a difference that holds consistently between contexts — 2 px dividers in navigation and 1 px in content, on every screen — is a rule, not an error.

#### How to fix

- **Token binding** — an exact match is bound directly. Binding to the nearest token changes pixels: do it only when the user accepted that value change.
- **Text without a style** — apply the text style whose values match; if none matches exactly, it's a value change the user must accept.
- **Primitive → semantic** — rebind to the semantic token that resolves to the same value, so nothing visible changes.

## Fixing

- Never fix anything on your own initiative. The audit only reports.
- The user picks issues by number ("fix 2, 5, 7–12", "fix all naming"). Fix exactly those, nothing else.
- An issue on corresponding layers of several screens is fixed on all of them together. A fix applied to one screen only makes the copies diverge and breaks multi-edit in Figma.
- Each check describes how to fix its own issues (*How to fix*).

### Fix protocol

1. **Before** — for layout and structure fixes (sizing, constraints, auto layout, nesting), run the snapshot script on the affected subtree's root. Renames and token bindings need no record.
2. **Apply** the fix through the bridge on every corresponding layer of every selected screen, batched.
3. **After** — snapshot the same root again and compare positions and sizes. Only the intended change may differ: a binding, the shift of a removed invisible stroke. Any other layer that moved or resized means the fix broke something — revert it with the bridge (set the old values back) and report why.
4. **Report** what changed, by issue number, in one short list, and select the changed layers in Figma.

## Rules

### Scope

- Work on the current selection: every nested layer, including the content of instances. Skip only the internals of icon components (their vectors, paddings, names) — they are imported assets.
- If nothing is selected, ask what to check — the current page (its top-level frames) or the whole file (page by page) — or ask the user to select layers and run the command again. Wait for the answer.

### Several screens

When several screens are selected, also compare them with each other. The same parts — header, footer, the screen's own sizing — should be built the same way on every screen. A difference that repeats consistently across screens shows what is deliberate.

Screens with the same structure (desktop and mobile versions, several pages of one template) contain corresponding layers — the same element at the same place in the tree. An issue on corresponding layers is one issue: report it once, listing every screen.

The same applies to repeated blocks on one screen — two project panels, a list of identical sections. They should be built the same way: previews on Fill in one panel and on Fixed in the other, or a 2 px gap in one and 1 px in the other, is an inconsistency to report. Suggest the variant most of the blocks use; when there are only two, show both and let the user choose. Don't prefer one technique over another — a grid and an auto layout stack are both valid.

### Economy

Keep runs lean — every call and every line of output costs time and context:
- Read the selection once with the snapshot script. Don't re-read layers and don't take screenshots during an audit.
- Keep the investigation internal and short. Never output research notes, inventories, coverage statistics, path tables, node IDs or a methodology — the user sees only the final report.
- Report at most 10 issues per run, the most important first. If there are more, end with one line: "N more lower-priority issues — ask to see them".
- Don't plan fixes in the audit. A fix is worked out only when the user picks the issue.

### Judgment

Many checks rely on intent that cannot be measured exactly — "close to the edge", "roughly equal", "proportional". Judge relative to the parent's size. When the intent is unclear, either skip the finding or give it one Info row — never a paragraph of reasoning.

### Safety

- Analyze first, change second. Never modify the canvas before the user has seen what will change and picked it.
- Never delete layers without explicit confirmation.
- Do not edit main components that come from a published library — report the issue instead.

### Communication

- Reply in the language the user writes in.
- Refer to layers by name and path (`Card / Header / Title`) so the user can find them.

### Working with Figma

Figma is reached through Claude Bridge — a local server plus a plugin running in Figma. Use only the bridge; don't use the Figma MCP or `use_figma`.

**Read** with the snapshot script from this skill's base directory (shown when the skill loads):

```bash
node "<skill base dir>/scripts/snapshot.mjs"              # current selection
node "<skill base dir>/scripts/snapshot.mjs" 217:5882     # specific layers
```

It checks the bridge, saves the raw JSON — layout of every layer, variables, styles — to a temp folder, and prints a compact tree with a legend. Work from that output; open the saved JSON only for a detail the tree doesn't show (variable IDs are in `variables.json`). If the script says the server is down, start it as printed; if the plugin is closed, ask the user to open Claude Bridge in Figma.

**Act** by posting commands to the bridge; use `batch` for several changes in one call. Each command is one undo step in Figma.

```bash
curl -s -X POST http://localhost:3571/command -H "Content-Type: application/json" \
  -d '{"action": "rename", "nodeId": "217:6092", "name": "header"}'
```

| Purpose | Action |
|---|---|
| show layers to the user | `set_selection` {nodeIds}, `scroll_to_node` {nodeId} |
| rename | `rename` {nodeId, name} |
| Fixed / Hug / Fill, min / max | `set_sizing` {nodeId, axis, mode}, `set_min_max_size` |
| constraints | `set_constraints` {nodeId, horizontal, vertical} |
| auto layout, gap, padding, wrap, alignment | `set_layout` |
| absolute or in flow | `set_layout_positioning` {nodeId, positioning} |
| bind a variable | `apply_variable` {nodeId, property, variableId} |
| text style | `apply_text_style` {nodeId, styleId} |
| strokes, fills | `set_strokes`, `set_fills`, `remove_fill`, `remove_stroke` |
| hide, delete | `set_visible`, `delete_node` |
| move to another parent, reorder | `reparent`, `reorder` |
| instances | `create_instance`, `swap_instance`, `reset_instance` |

The full action list with parameters is what the `figma_reference` tool of the `claude-bridge` MCP server returns (the same text is `server/reference.md` in the Claude Bridge repo). The MCP tools `figma` / `figma_batch` work as well as curl for acting.

### Report format

The report goes in the chat. Keep it short and easy to scan.

1. **Summary** — one line: what was checked and issue counts by severity.
2. **Issues** — one table per severity, under the headings *Errors*, *Warnings* and *Info*. Number the rows continuously through the whole report (1, 2, 3…) so the user can refer to them.

   | # | Issue | Layer | Now | Suggested |
   |---|---|---|---|---|
   | 1 | Top bar named as a column | col | `col` | `header` |
   | 2 | Padding not bound to a token | Section | `96` | `Grid/Mega` |

   - **Issue** — up to ~10 words.
   - **Layer** — the layer's own name, not the full path. If the name repeats, add a short hint: `col (top)`, `col (bottom)`. Several layers with the same issue share one row, separated by commas.
   - **Now** / **Suggested** — just the value: a name, a number, a token, a setting. Round pixel values to whole numbers. No explanations.

   Nothing else: no text before the summary, no notes between or after the tables except the next-step question.
3. **Next step** — ask which issues to fix: by number ("1, 4–6"), by group ("all errors") or all. The user can also ask to see an issue: select its layers in Figma (`set_selection`, then `scroll_to_node`).

**Group repeats.** The same problem on many layers is one row, not many: "padding 96 not bound to `Grid/Mega`" with every affected layer in the Layer cell. When most layers fail the same check — a page with no spacing bound at all — say so in one line ("spacing on this page is not tokenized: 87 values") and give one row per distinct value. An issue inside a component instance is one row for the main component, not one per instance.

Severity:
- **Error** — breaks the system or responsiveness; must be fixed.
- **Warning** — inconsistency that should be fixed.
- **Info** — suggestion, or a possible issue where the intent is unclear.
