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
