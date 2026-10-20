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
