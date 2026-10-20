- Never fix anything on your own initiative. The audit only reports.
- The user picks issues by number ("fix 2, 5, 7–12", "fix all naming"). Fix exactly those, nothing else.
- An issue on corresponding layers of several screens is fixed on all of them together. A fix applied to one screen only makes the copies diverge and breaks multi-edit in Figma.
- Each check describes how to fix its own issues (*How to fix*).

### Fix protocol

1. **Before** — for layout and structure fixes (sizing, constraints, auto layout, nesting), run the snapshot script on the affected subtree's root. Renames and token bindings need no record.
2. **Apply** the fix through the bridge on every corresponding layer of every selected screen, batched.
3. **After** — snapshot the same root again and compare positions and sizes. Only the intended change may differ: a binding, the shift of a removed invisible stroke. Any other layer that moved or resized means the fix broke something — revert it with the bridge (set the old values back) and report why.
4. **Report** what changed, by issue number, in one short list, and select the changed layers in Figma.
