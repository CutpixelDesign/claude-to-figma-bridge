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
