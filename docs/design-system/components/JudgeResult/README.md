JudgeResult shows the judge's verdict for a whole submission or one test.

- Consumer provides: `code` (`AC`, `WA`, `TLE`, `MLE`, `RE`, `CE`, or `pending` while queued or running).
- `AC` uses the `pass` colour, every failure the `violation` colour, `pending` `ink-muted`. The code is always printed, so colour is never the only signal.
- Students see per-test results but never test input or output (FAQ-02).
- `size="large"` (`lk-judge--large`) is for the overall result of a submission on the submit page; per-test results keep the default size.
