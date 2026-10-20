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
