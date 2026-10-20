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
<!-- TODO: что конкретно относится к каждому уровню — решим позже -->
