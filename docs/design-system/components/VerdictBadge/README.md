VerdictBadge shows the checker's or the TA's verdict for one (submission, constraint) pair.

- Consumer provides: `verdict` (`pass`, `violation`, `unsure`). The badge renders the word, the glyph and the colour together.
- `unsure` is rendered only in TA views; student views never receive it.
- Don't: show a deduction amount inside the badge; the deduction comes from the constraint and sits in its own column.
