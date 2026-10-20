---
name: cp-layout-audit
description: Checks the responsive behavior of the selected Figma frames — fixed / hug / fill resizing, min / max sizes, the screen's own sizing, text resizing, constraints of absolute and decorative layers, auto layout. Reports numbered issues in the chat and fixes only the ones the user picks. Use when the user asks to check responsiveness, resizing, constraints or auto layout ("проверь респонсив", "проверь адаптивность", "проверь автолейаут", "проверь constraints", "fill / hug").
---

# Layout audit

Check that the selected frames adapt when content changes or the screen resizes, report numbered issues, and fix only the ones the user picks.

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

### Responsiveness

Responsive behavior is mandatory. Every layer's resizing (Fixed / Hug / Fill), min / max sizes and constraints must make sense in its context: when content changes or the parent resizes, the layout must adapt instead of breaking.

#### Fixed size

Fixed size is meant for static content: shapes, vectors, icons, images, and the top-level `Screen` frame.

The screen frame itself has a fixed width — the device or breakpoint width — and its sections Fill it. A screen whose width Hugs a fixed-width child (the header holds the 412 px) is an error: fix the screen's width, set the child to Fill. Its height is fixed when the screen fits the viewport, or Hug with a min height for a scrolling page.

A Fixed size bound to a size variable (e.g. a sidebar width token) is a deliberate design decision — don't flag it.

A container with a Fixed size is **intentional** when:
- its aspect ratio is locked;
- it contains only an icon, shape or image;
- it contains text and its dimensions are proportional — e.g. a 24×24 bullet with a number inside: the fixed size keeps the digits on one line.

A Fixed container with text and non-proportional dimensions is a **likely error**: the content cannot grow.

Recommended fixes:
- sidebars, columns, panels and similar: width Hug + min width, or width Fill + max width;
- buttons and similar controls: height Hug + min height;
- `container`: never a fixed width — it gets a max width, or its width comes from the outer wrapper.

#### Fill

- Rows (horizontal auto layout) are usually Fill width.
- Cols (vertical auto layout) depend on their purpose — don't flag their width by default.
- Fill in both width and height is valid inside a parent with a fixed size.

#### Vertical growth

Build so new content pushes everything below it down, wherever the design implies that: containers holding variable content Hug their height.

#### Text layers

- Text with a fixed height is a likely error. Text set to Fill height is not fixed — it stretches to its cell or row on purpose (e.g. a decorative number centered in a grid cell).
- In a vertical auto layout: width Fill, height Hug.
- In a horizontal auto layout: width Hug, height Hug. Exception — text that takes the remaining space of the row is Fill width: a label before a trailing element (nav item with an indicator), or wrapping text next to a bullet or icon (list item).
- Truncated text (max lines) also works with height Hug. Recommend a min height that fits all its lines: font size × line height × number of lines (if the line height is in px: line height × number of lines).

#### Constraints

Applies to every layer positioned by constraints — children of frames without auto layout and layers with *Ignore auto layout* (absolute position). Compare the layer's gaps to the parent's edges with its constraints, on each axis.

The layer is pinned to the corner or center it sits closest to:

| Position in the parent | Constraints |
|---|---|
| top left | Top + Left |
| top right | Top + Right |
| bottom left | Bottom + Left |
| bottom right | Bottom + Right |
| center | Center + Center |

Example: a 25 px line 15 px from the left edge of a 250 px block → Left.

A layer stretched along an axis with equal or nearly equal gaps on both sides, but pinned to only one side, is a likely error: suggest Left & Right (or Top & Bottom) so it scales with the block.

Scale is right for elements whose size is a proportion of the parent: vectors inside an icon (when the icon container has equal width and height or a locked aspect ratio), the fill of a progress bar, bars of a chart. Don't apply the corner rule to them.

Decorative absolute layers — glows, blurs, background shapes — follow the same rules, and a wrong constraint on them is an error. A glow in the bottom left corner pinned Right + Center drifts away from its corner as soon as the screen resizes or the page grows.

### Auto layout

- **Missing auto layout.** A frame whose two or more children stand in a row, a column or a grid with even gaps must be an auto layout frame — report it. Frames without auto layout are fine for illustrations and decorative compositions, overlapping layers (a badge over an avatar), background layers and the internals of icons.
- **Grid.** A grid is a valid choice even with a single column — don't report it as "should be an auto layout".
- **Spacers.** An empty frame or a transparent rectangle placed between elements to fake a gap, or along an edge to fake a padding — report it; the gap or padding belongs to the auto layout.
- **Absolute inside auto layout.** Fine for decoration (glows, backgrounds), badges and indicators on a corner, sticky bars and overlays. A content element — text, button, card — set to absolute doesn't push its neighbors and overlaps them when the content grows: report it.
- **Space between.** Right when elements are pinned to the edges (logo on the left, actions on the right). Wrong when it fakes a gap in a fixed-width container: at another width the elements drift apart — report it. Space between in a Hug container does nothing — report it too.
- **Wrap.** A row of tags, chips or buttons that would run past the edge on a narrow screen should wrap. Report fixed rows (three per row, split into separate frames) instead of one wrapping row.
- **Overflow.** A Fixed child wider than its Fill parent, or than a parent limited by a max width, sticks out or gets clipped on a narrow screen — report it.
- **Layer order.** In a frame without auto layout, the layer order should follow the visual order (top to bottom, left to right). A mismatch confuses handoff — report it as Info.

#### How to fix

- **Sizing** (Fixed → Fill / Hug) — after the change, the layer's size on the current screen must stay the same. If Hug would shrink a layer that is taller than its content on purpose, keep the size with a min height.
- **Constraints** — change only the constraint; the layer keeps its current position.
- **Missing auto layout** — apply auto layout with the direction, gap and padding taken from the current positions; every child must stay where it is.
- **Spacers** — delete the spacer and set the gap or padding to its size.
- **Absolute content** — put the element back into the flow at its visual position. Neighbors may move: that is a value change the user must accept.
- **Fake gap with space between** — set a fixed gap equal to the current spacing and align to the start.
- **Wrap** — merge the rows into one auto layout with wrap; the cross-axis gap equals the gap.
- **Overflow** — Fill with a max width instead of a fixed width.
- **Layer order** — reorder the layers to match the visual order; nothing visible changes unless layers overlap.

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
