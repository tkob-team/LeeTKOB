Button triggers one action; its label says what happens.

- Consumer provides: label text, variant (`primary`, `secondary`, `danger`), `disabled` and, when disabled, the reason shown as text beside it.
- One `primary` per screen area (e.g. "Publish marks", "Submit code"). `danger` is for actions that remove or overturn something (reject an appeal, delete a lab): a solid `danger` fill with `on-danger` text, never a verdict colour. It confirms inside a `ConfirmDialog`, never on the page.
- Do: keep labels to a verb phrase. Don't: use verdict colours on buttons, or disable without saying why.
