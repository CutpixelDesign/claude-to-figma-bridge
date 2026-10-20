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
