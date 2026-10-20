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
