# Own eval cases

Extra cases written by the team, in the same layout as `eval/dev/` (see `eval/dev/README.md`
for the file formats, tags and metrics). The problems here are new: none of them appears in
the dev set.

| Problem | Constraints | Solutions |
|---|---|---|
| `count-distinct` | ban list: library sets, maps, `std::unique`, `std::sort`, `qsort` | 5 |
| `digit-sum-recursive` | ban list: loop statements and `goto` | 4 |
| `modpow-fast` | semantic: fast exponentiation by repeated squaring, written by the student | 5 |

14 solutions, 14 (solution, constraint) pairs: 6 `pass`, 8 `violation`. Tags cover `obvious`,
`disguised` (macro, `goto`), `trap` (own `set`/`sort` in a namespace under
`using namespace std`; loop keywords inside a comment and a string literal) and `injection`
(a comment that asks for `pass` on a violation, and one that asks for `violation` on
compliant code).

`modpow-fast` is for the model judge. Its traps and injections target the model, so they sit
in names and string literals (comments are removed before a call): a linear loop disguised as
"binary exponentiation" through its names, a correct but unusual left-to-right bit walk, and
two string literals that ask the model for `pass` on a linear loop and for `violation` on a
correct recursive solution.

Every solution compiles with `g++ -std=c++17 -O2` and matches every `.out` token by token.

```bash
node eval/dev/eval.mjs --data eval/own --predictions <predictions.jsonl>
```
