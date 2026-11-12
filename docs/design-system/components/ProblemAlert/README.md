ProblemAlert shows an API error (RFC 9457 problem details).

- Consumer provides: the problem object. Render `title` as the heading and `detail` as the sentence; render `type` only for TAs.
- Place it above the form or action that failed. For field errors in `errors[]`, show each message under its field instead.
- Don't: show stack traces or raw JSON.
