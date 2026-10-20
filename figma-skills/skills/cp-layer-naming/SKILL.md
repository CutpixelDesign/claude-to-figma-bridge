---
name: cp-layer-naming
description: Checks layer names in the selected Figma frames — auto-generated and junk names, role names (row, col, grid, container…) that don't match the layer, Figma's number suffixes, text layers named after their content, inconsistent names of instances and of the same layer across screens. Reports numbered issues with suggested names in the chat and renames only the ones the user picks. Use when the user asks to check, clean up or fix layer names ("проверь нейминг", "проверь названия слоёв", "переименуй слои", "наведи порядок в именах").
---

# Layer naming

Check the layer names of the selected frames, report numbered issues with suggested names, and rename only the ones the user picks.

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

### Layer naming

Check every layer against the naming rules below. Report each wrong name with the suggested one.

Names follow web layout logic, kept light. A layer that already has a meaningful name (`panel`, `Header`, `price`) keeps it.

**Meaning before structure.** When a layer needs a new name — auto-generated, junk, misleading, or a role name that doesn't match — first look at what it is in the interface. A layer with a recognizable role gets that name:
- `header` — the bar at the top of a screen, card or modal (title, close, back);
- `footer` — the bar at the bottom (actions, prev / next, copyright);
- `nav`, `sidebar`, `hero`, `card`, `modal`, `tabs`, `list`, `toolbar`, `badge` and the like.

Only when the role isn't clear, fall back to the structural names in the table below. A horizontal top bar named `col` becomes `header`, not `row`.

**Misleading names.** A custom name that contradicts what the layer is — `icon` on a divider line, `Tool note` on a section title — is an error: rename it by meaning, or by the table.

**Numbers.** A number in a name is either Figma's counter (noise) or part of the name (`Windows 11`, `Formula 1`). Never strip a number that may belong to the name.

1. **Figma's default names** — `Frame`, `Group`, `Rectangle`, `Ellipse`, `Line`, `Vector`, `Polygon`, `Star`, `Section` followed by a number — are auto-generated. Replace them by role (table below): `Frame 232412` → `row`, `Group 58` → `Group`.
2. **Deliberate sequence.** Sibling layers numbered from one — `1, 2, 3` or `01, 02, 03` — keep their names as they are, even `Frame 1`, `Frame 2`. Consecutive large numbers (`2002, 2003, 2004`) are Figma's counter, not a sequence.
3. **Custom names with a number** — the number is part of the name by default. Leave it when:
   - the name is in *Protected names* below;
   - the same name with the number appears in the layer's text or nearby text (a `Windows 11` layer showing the text "Windows 11");
   - the number is short (1–2 digits).

   Only a long number (3+ digits) that matches none of the above looks like a leftover counter (`card 1834`). Report it as Info and suggest removing the number — the user decides.

**Protected names** — product and domain names that contain numbers. Never strip their numbers. They are kept per computer in `~/.claude-bridge/protected-names.md` (one name per line, in backticks): read that file before renaming anything. If it doesn't exist or lists nothing, there are no protected names on this computer — rule 3 above still applies.

**Whitespace.** Leading or trailing spaces and double spaces in a name (`text `) are an error: they break search and multi-edit. Trim them.

**Junk names** — `test`, `temp`, `copy`, `new`, `untitled`, `asdf`, `final` and the like — are an error: they are not meaningful. Replace them by role, like auto-generated names.

**Role names must match the layer.** The names from the table below describe structure, so they must be true: a horizontal auto layout named `col`, or a vertical one named `row`, is an error even though it isn't auto-generated — suggest the right name. Match role names regardless of case: `Row` on a vertical layout is as wrong as `row`.

**Container pairs.** A full-width layer and the content wrapper inside it are `container-fluid` → `container`, so the names don't repeat: a full-width layer directly inside a `container-fluid` is its `container`, not a second `container-fluid`. A `container` needs no width limit.

**Instances and components.** Their naming format is project-specific — never impose one. Infer the convention from the file itself and flag only inconsistency: instances of the same component next to each other named differently — `Horizontal tab item` for four of them and `<tab-item>` for the fifth — are an error. Suggest the name the file uses most.

**Same layer on different screens.** Screens with the same structure (desktop and mobile versions, several pages of one template) contain corresponding layers — the same element at the same place in the tree. Figma's multi-edit selects such layers across screens by matching names, so:
- a suggested name is decided once per corresponding layer and is identical on every screen — never rename one copy differently from the others;
- corresponding layers that already have different names on different screens are a warning: they break multi-edit.

**Letter case.** Custom names in mixed case on one screen (`header`, `chips` next to `Headline`, `Section Title`) are Info — worth attention, not an error.

**Auto-generated names** — Figma's default type names with or without a number (`Frame 2032`, `Rectangle`, `Ellipse`…) — are replaced by role. Pick the first rule that matches:

| Layer | Name |
|---|---|
| Top-level frame of the screen | `Screen` |
| The outermost layer spanning 100% of the screen width, at any depth | `container-fluid` |
| The content wrapper inside a `container-fluid` — with or without a max width — or any layer with a max width | `container` |
| Grid auto layout | `grid` |
| Horizontal auto layout with wrap | `row wrap` |
| Horizontal auto layout | `row` |
| Vertical auto layout | `col` |
| Frame without auto layout | `wrapper` |
| Group | `Group` |
| Straight line | `Divider` |
| Curved or broken line | `Line` |
| Avatar or profile picture (a shape with an image fill of a person) | `Profile` |
| Any other shape with an image fill | `image` |
| Any other shape (rectangle, ellipse, polygon, star, vector) | `Vector` |

**Text layers.** Figma names a text layer after its content ("Jane Cooper", "From self-taught graphics and…"). A name that repeats the layer's own text is auto-generated: replace it with a short role name — `Title`, `Subtitle`, `Label`, `Description`, `Caption`, `Value` and the like. Infer the role from the text style first (`Titles/h3` → `Title`, `Content/Label` → `Label`, `Content/p` → `Description`), then from size and position. A text layer with a custom name keeps it.

#### How to fix

Rename. Corresponding layers on all screens get the same name.

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
