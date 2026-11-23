# Modular power

Answer `q` queries. Each query gives `a`, `b` and `m`; print `a^b mod m`. This lab practises
fast exponentiation by repeated squaring.

## Input
- Line 1: `q` (1 ≤ q ≤ 100).
- Next `q` lines: `a b m` (0 ≤ a ≤ 10^9, 0 ≤ b ≤ 10^6, 1 ≤ m ≤ 10^9).

## Output
- One line per query: `a^b mod m` (note that `x^0 mod 1` is 0).

## Example
Input
```
3
2 10 1000
3 0 7
5 3 1
```
Output
```
24
1
0
```

## Limits
Time limit: 2 seconds. Memory limit: 256 MB. Compiled with `g++ -std=c++17 -O2`.

## Constraints
The lab constraints and their deductions are in `constraints.json`. A submission is Accepted when it passes every test; the constraints are checked separately, before grades are published.
