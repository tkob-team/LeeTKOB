"""Cost of one lab for the checker model. Prices: USD per 1M tokens, from
https://ai.google.dev/gemini-api/docs/pricing (fetched 2026-11-10, no update date on the page)."""
students, constraints = 80, 5
in_tok, out_tok = 2_000, 1_500  # per call; out_tok includes thinking tokens. Assumptions, not measured.
calls = students * constraints
for label, p_in, p_out in [("gemini-3.6-flash until 2026-12-31", 0.75, 3.75),
                           ("gemini-3.6-flash from 2027-01-01", 1.50, 7.50)]:
    cost = calls * in_tok / 1e6 * p_in + calls * out_tok / 1e6 * p_out
    print(f"{label}: {calls} calls, one pass ${cost:.2f}, with 2x retries/re-reviews ${2*cost:.2f}")
