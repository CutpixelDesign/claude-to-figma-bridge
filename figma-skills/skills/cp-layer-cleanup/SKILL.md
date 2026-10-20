---
name: cp-layer-cleanup
description: Checks the layer structure of the selected Figma frames — invisible strokes and fills that still affect layout, fractional positions and sizes, hidden layers, empty frames, detached instances, and redundant nesting (wrappers whose job can move to the child or parent). Reports numbered issues in the chat and fixes only the ones the user picks, keeping the screen visually identical. Use when the user asks to clean up layers, simplify nesting, remove extra wrappers or find leftovers ("почисти слои", "убери лишнюю вложенность", "лишние фреймы", "проверь структуру слоёв").
---

# Layer cleanup

Check the layer structure of the selected frames, report numbered issues, and fix only the ones the user picks — the screen must look the same afterwards.

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

### Layer structure

- **Invisible strokes that affect layout.** A transparent or 0-opacity stroke included in the layout is invisible but still shifts children and resizes columns. Example: a transparent 2 px left stroke on a grid pushes its first column 2 px right and turns column widths fractional. This is an error — suggest removing it.
- **Invisible paint leftovers.** Fills and strokes with 0 opacity, and paints switched off (hidden in the fill or stroke list), do nothing visible. Report them as leftovers. Inside a component, report them once for the main component.
- **Fractional values.** Flag fractional positions, fixed sizes and paddings (a layer at x = 0.5, a 16.5 px divider, a 4.234 px padding) — they render blurry. Fractional widths that come from Fill or grid fractions are acceptable, unless something else causes them (like the invisible stroke above). A stroke included in the layout is a common cause: a 1 px bottom border leaves an odd inner height, and centered children land on half pixels.
- **Hidden layers** — report them.
- **Detached instances** — a frame that was an instance of a component and was detached. Report it, naming the component it came from when you can tell.
- **Empty frames** — frames with no children and no visual role (no fill, stroke or effect). Report them.

Don't report nesting depth or layers that extend beyond their parent's bounds.

#### Redundant nesting

A wrapper is a frame or group that sits between a parent and a single child. Look for every wrapper and decide what it actually does. Don't stop at "it has some property, so it's needed" — most properties a wrapper carries can move to the child or the parent.

Report a wrapper only if removing it doesn't break the structure. Before reporting, play the removal through: the child takes the wrapper's place in the parent (with whatever the wrapper carried, moved over). It must get the same size and position, keep its Fill / Hug behavior, and the parent's order, gap and alignment must stay as they are. If anything would change, the wrapper is doing a job — don't report it.

Report as a **warning**:
- **Pass-through wrapper** — no fills, strokes, effects, radius, clipping, opacity, padding, min/max; it hugs its child or matches the child's sizing. Removable as is.
- **Wrapper with a transferable job** — it carries one thing the neighbor can take over exactly:
  - only padding, and the child is an auto layout frame → the padding moves to the child;
  - only a fill, stroke or radius on the same bounds as the child → the look moves to the child;
  - the same auto layout direction as its single auto layout child → the two merge into one frame;
  - a grid cell placement or an explicit variable mode → the child takes it over.

  Name what moves where in the suggested fix.
- **Chain** — several wrappers in a row, each passing the child through. Report the chain as one issue.
- **Group with UI inside an auto layout** — a group holding text or frames doesn't take part in auto layout sizing; suggest an auto layout frame. Groups of vectors (icons, illustrations) are fine.

Not redundant — don't report:
- a wrapper that changes the layout direction, alignment or sizing behavior of its child in a way the child can't express itself;
- a clipping container, a mask, a container for absolute children;
- a `container` inside a `container-fluid`, or a `container` that limits the width — the pair is the convention;
- an instance, component, component set or slot.

#### How to fix

- **Invisible properties** — remove them; the shift they caused disappears, and that is the intended change.
- **Hidden layers, empty frames** — delete them only when the user picked them; nothing visible changes.
- **Detached instances** — replace with an instance of the original component when it still exists, keeping the overrides the user wants; otherwise report that it can't be reattached.
- **Redundant nesting** — move what the wrapper carries (padding, fill, stroke, radius, variable mode, grid cell placement, a meaningful name) to the child or the parent, reparent the child, delete the wrapper. The screen must look identical. If a property can't move exactly, keep the wrapper and say why.

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
