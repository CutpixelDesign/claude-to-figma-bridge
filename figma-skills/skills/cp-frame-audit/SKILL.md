---
name: cp-frame-audit
description: Full audit of the selected Figma frames in one run — responsiveness and constraints, paddings and gaps, layer names, layer structure, and design-system usage (colors, text styles, effects, radii, strokes). Reports numbered issues in the chat and fixes only the ones the user picks. Use when the user asks for a complete or full audit ("полный аудит", "проверь всё", "full audit"). For a single area prefer its dedicated skill — cp-layout-audit, cp-spacing-audit, cp-layer-naming, cp-layer-cleanup, cp-token-audit.
---

# Frame audit

Run every check at once on the selected frames, report numbered issues, and fix only the ones the user picks.

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

### Spacing

Covers auto layout gaps (including the cross-axis gap of wrapped layouts) and paddings on all four sides. In frames without auto layout, the distances between children and to the frame edges play the same role.

Skip values that carry no number to check or have no effect:
- gap with a distributed alignment — Auto, space between / around / evenly — Figma ignores the gap value there;
- negative gaps used on purpose for overlapping stacks (avatars, cards);
- the gap of a container with a single child;
- zero values — they need no token;
- spacing inside icon components.

Strokes included in the layout add to the padding: a 1 px top border with a 24 px padding puts the content at 25 px. Account for the stroke before calling paddings unequal.

#### Step 1 — find the source of truth

**Spacing tokens exist** (variables for gap / padding / spacing in the file or its libraries): the tokens are the rule.
- A value that equals a token but is not bound to it is an **error** — the binding was missed. Suggest binding it.
- A value that matches no token is off-system. Suggest the nearest token. If the same off-system value is used consistently (e.g. 15 px side padding everywhere), say it may be a deliberate exception missing from the tokens.

**No spacing tokens:** derive the pattern from the design itself.
- Collect every spacing value with its usage count and where it is used.
- Identify the base grid (4 / 8 px…) and the established exceptions: a value off the grid that is used consistently in the same role (15 px side padding on every screen) is part of the pattern, not an error.
- Open the report with the detected pattern, so the user can confirm or correct it.

#### Step 2 — find the inaccuracies

- **Near misses.** A rare value close to a common one (13 next to 15, 7 next to 8) is likely an inaccuracy — suggest the common value.
- **Broken symmetry.** Left and right paddings that are almost equal but not equal — left 13, right 15 — make the content drift off-center. Suggest equal values. A large difference between sides is usually deliberate — don't flag it. Top and bottom paddings often differ on purpose; judge them only by comparison with similar elements (next point).
- **Inconsistent repeats.** Similar elements should share the same paddings and gaps — cards in a list, items in a menu, sections of a page. Even two similar items in a row with different paddings are a likely error. Flag the outlier and suggest the value the others use; if there are only two items, show both values and let the user choose.
  - Compare instances of the same component only within the same variant. A difference that comes from a variant — e.g. the active nav item has a larger left padding — is by design.
  - Compare within the same context. A difference that holds consistently between contexts — navigation vs content, on every screen — is a rule, not an error.
- **Reserved space.** A padding that reserves room for an absolute element — the page's bottom padding equal to the height of a sticky bottom bar — is deliberate even off the grid. Report it as Info only: the two values are coupled and must change together.

#### How to fix

- **Missed binding** — bind the value to the token it already equals.
- **Off-system value, near miss, broken symmetry, outlier** — changing the value moves pixels: apply the value the user accepted in the report, nothing else.

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
