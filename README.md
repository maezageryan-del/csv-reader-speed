# Fast csv-reader — a faster drop-in for csv-reader 1.0.0

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/maezageryan-del/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/maezageryan-del/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0, written for the
[csv-reader-speed-01-run-20261121 bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121).
`solve.js` answers every case exactly as the reference does — BOM drop, CRLF/LF,
stray CRs, quote junk, unterminated quotes, short and long rows, error order and
all — while scanning instead of crawling: about **3.5x faster than the reference
on the practice set** (CPU time, ~200 ms vs ~700 ms per set on the build box).

## How it works

- **Unquoted fields:** the next comma bounds one slice; a single regex test on
  that slice settles whether it holds a line break. A lone CR is the only slow
  case, and it is rare.
- **Quoted fields:** `indexOf('"')` jumps to the next quote. A segment with no
  doubled quote and no line break is sliced as-is (the common case); only
  segments holding a break or a doubled quote pay a normalisation pass.
- **No per-field allocations:** field results travel in run-scoped variables,
  and field values are slices, never rebuilt strings.
- The house driver `main.ts` is kept verbatim (it turns V8's incremental
  marking off before importing `solve.js`).

## Correctness

Verified against the reference implementation before submitting:

- Practice set: **6/6 exact**.
- Three fresh sets drawn with the kit's own generator (new seeds): **18/18 exact**.
- Differential fuzzing vs the reference: **33,194 cases, zero mismatches**
  (194 hand-built edge cases, 20,000 random short strings, 5,000 random
  structured CSVs, 8,000 random longer strings).

## How to run

```sh
node main.ts   # reads cases from $MAKEFUN_INPUT_DIR (or /input), writes answers to $MAKEFUN_OUTPUT_DIR (or /output)
```

Node 22, standard library only, no dependencies, no network. Two runs on the
same input are byte-identical.

## Bounty

[Read broken CSV files faster, 21 November 2026](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
— write a faster drop-in for csv-reader 1.0.0; places go by CPU time, least
first, among entries that answer every case exactly. Closes 2026-11-23 02:42 UTC.
