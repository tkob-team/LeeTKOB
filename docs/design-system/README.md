LeeTKOB is a grading tool for teaching assistants (TAs) of an introductory C++ lab: students submit code, a judge runs it, and before marks are published a constraint checker proposes deductions with the exact code lines as evidence. The interface exists to make that evidence fast to read and hard to misread. Every screen is either a TA working through a queue or a student checking one submission.

## Content fundamentals

- The product UI is in Vietnamese. Write plainly, in short sentences, the way a TA or student says it: lab, bài nộp, ràng buộc, khoản trừ, hàng chờ duyệt, công bố điểm, khiếu nại.
- Keep the product terms exactly as the brief writes them, in English and lower case: `pass`, `violation`, `unsure`, and the judge verdicts `AC`, `WA`, `TLE`, `MLE`, `RE`, `CE`. Do not translate them.
- Buttons say what happens: "Công bố điểm", "Chấp nhận khoản trừ", "Bác", "Nộp bài". After the action, a toast confirms it ("Đã công bố điểm lab Sắp xếp"; see Feedback). Code, API fields, error `type` URNs and repository docs stay in English.
- Errors come from the API as problem details (RFC 9457). Show `title` as the heading and `detail` as the sentence under it; never show a stack trace. Show the `type` URN only to TAs, in `code` style.
- Numbers: marks out of 10 with one decimal ("7.0 / 10"); deductions with a minus sign ("−3"). Dates `dd/MM/yyyy HH:mm` in the viewer's time zone; the API sends UTC.
- No emoji anywhere in the product.

## Visual foundations

- Ground: `surface` for the page, `surface-raised` for panels and tables, `surface-sunken` for code. Separate regions with a 1px `border` line. No drop shadows.
- Type: IBM Plex Sans for the interface, IBM Plex Mono for code, URNs, IDs and anything a TA compares character by character. Use `display` only for a page title on empty states, `title` for page headings, `section` for panel headings, `body` for running text, `small` for metadata, `label` (uppercase, 0.04em tracking) for table headers and field labels, `code` for code.
- Colour: `brand` marks what you can act on (primary button, link, selected tab) and nothing else. The verdict colours `pass`, `violation`, `unsure` are reserved for verdicts and judge results; never use them for decoration or for buttons. `danger` (with `on-danger`, `danger-soft`) marks destructive actions: the confirm button of a `ConfirmDialog` and destructive warnings, nothing else. `evidence` highlights evidence lines only.
- Spacing: a 4px base (`space-1`…`space-8`). Panels pad `space-6` on desktop, `space-4` on phones. Table rows are 40px tall with `space-3` cell padding.
- Radius: `radius-sm` for badges and inputs, `radius-md` for buttons, panels and code blocks, `radius-lg` for dialogs. Nothing is fully round.
- Layout: TA screens are dense and wide (tables, a code panel beside the queue, max 1280px). Student screens are one column, max 760px. Every screen works at 400px wide; tables scroll inside their own container.
- Motion: none beyond 120ms colour transitions on hover and focus, and a 200ms colour cross-fade right after the viewer switches theme. Respect `prefers-reduced-motion`.

## Verdicts and evidence

- A verdict is always a word plus colour plus glyph (`pass` ✓, `violation` ✕, `unsure` ?) in the `VerdictBadge`. Never colour alone.
- Evidence is shown in `EvidenceBlock`: the original source lines with line numbers, evidence lines highlighted with `evidence` and their number in `ink`. The text shown must be the original line, not the comment-stripped copy sent to the model.
- `unsure` is shown only to TAs, always with its cause (model said unsure, wrong schema, evidence did not match, timeout, cost cap).
- Model `violation` rows are reviewed one by one: there is no "approve all" control for them. Hard-rule `violation` rows may be accepted as a group.
- "Publish marks" stays disabled, with the reason as text next to it, until the deadline has passed and the review queue is empty. Publishing asks for confirmation in a `ConfirmDialog` ("Công bố 80 điểm? Không hoàn tác được."), like every destructive action (see Feedback).

## Feedback

- Destructive or irreversible actions (remove, delete, rotate a code, discard a draft, publish marks) confirm in a `ConfirmDialog`: a native modal `<dialog>` opened with `showModal()`, never `window.confirm`, `alert` or `prompt`, and never a second button that appears inside the page or a table row. Actions that can be undone in one step without losing data (clearing a selection) do not confirm.
- The dialog title is a question naming the object ("Gỡ Sinh viên 1 khỏi Lớp thử nghiệm 1?"); one or two sentences say what happens and whether it can be undone. The confirm button is verb + object ("Gỡ Sinh viên 1"), never "OK" or "Có", on the right in the `danger` style (a solid `danger` fill with `on-danger` text); "Huỷ" is on the left and has the focus when the dialog opens. The focus stays inside the dialog and returns to the button that opened it. Esc and a click on the backdrop cancel.
- While the action runs, both buttons are locked, the confirm button reads "Đang gỡ…" and Esc does nothing. On success the dialog closes and a toast confirms. On failure the dialog stays open with the error inside it (`ProblemAlert`). Only one dialog is open at a time.
- Success is a toast (`ToastProvider` at the app root, `useToast()` in a screen): a sentence starting with "Đã …" that names the object, bottom right (full width at the bottom below 600px), in a polite live region. It hides after 5 s, waits while the pointer is over it or the focus is inside it, has a close button, and at most 3 are stacked. Never a status line placed in the page, never one line shared by two actions, never a message left over from an earlier action.
- A warning toast reports a part of a successful action that was left unchanged ("Thư mục sort-merge không có file test nào; test hiện có được giữ nguyên."). It starts with the word "Lưu ý:" and has a thicker `ink` left edge, never a verdict or `danger` colour, and otherwise behaves like a success toast (`useToast().warn`).
- Errors never go into a toast. The error of an action is a `ProblemAlert` inside the form or dialog that caused it, does not hide itself, and goes away when the user edits or retries. A field error sits under its field (`FormField error`). A page that failed to load shows a `ProblemAlert` under its title.
- Bulk actions on a table: a checkbox column, a "select all visible rows" checkbox in the header (indeterminate when some are selected), and an action bar in a space of fixed height above the table that is always reserved, so the table never moves. A destructive bulk action opens a `ConfirmDialog` that names up to 5 rows and "và N khác", shows progress ("Đang gỡ 3/12…"), then the result row by row; rows that failed stay selected. The per-row action column is narrow, aligned right, and its buttons keep their width when their state changes.

## Accessibility

- Text meets 4.5:1 on the grounds its token note names, in both themes; borders, icons and the focus ring meet 3:1.
- Every interactive element shows a 2px solid `focus` ring with 2px offset on keyboard focus.
- Status is never colour alone: verdict badges carry a word and a glyph; judge results carry their code.

## Iconography

No icon set is fixed yet. When an icon is needed, use Lucide (React) at 16px with 1.5px stroke, coloured by the text token it sits next to. Glyphs ✓ ✕ ? inside verdict badges are text, not icons.

## Using it in the repository

Copy the tokens into `frontend/src/styles/tokens.css` as CSS custom properties with the same names (`--surface`, `--brand`, `--space-4`, `--radius-md`, `--font-sans`, `--font-mono`), with the dark values under `prefers-color-scheme: dark`. A theme the viewer picks with the header toggle is saved in `localStorage` (`leetkob.theme`) and set as `data-theme="light"` or `"dark"` on `<html>`; it overrides the operating system, which applies only while no theme is saved. Build React components in `frontend/src/components/ui/` that match the previews here and use the same class names (`lk-btn`, `lk-verdict`, `lk-evidence`, `lk-problem`, `lk-table`, `lk-field`, `lk-dialog`, `lk-toast`). Feature code under `frontend/src/features/<flow>/` uses those components and never hard-codes a colour, size or radius.
