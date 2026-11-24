# Roadmap: exact decimal arithmetic

Kalkül currently calculates with JavaScript floats. Money and large numbers come out wrong:

| Input | Today | Correct |
|---|---|---|
| `0,1 + 0,2 - 0,3` | `5,551115e-17` | `0` |
| `round(1,005; 2)` | `1` | `1,01` |
| `floor(0,7 + 0,1; 1)` | `0,7` | `0,8` |
| `12.345.678.901,23 €` | `12.345.678.901,20 €` | `12.345.678.901,23 €` |
| `123.456.789.012.345 + 1` | `123.456.789.012.000` | `123.456.789.012.346` |

Goal: every value is an exact decimal. Nothing else about the app changes.

## Overview

| Step | What | Model | E2E-testable | Fixes |
|---|---|---|---|---|
| D0 | Test harness, acceptance tests, CI | — | ✅ | ✅ done |
| D1 | `num.ts`: add `decimal.js`, one configured `Decimal` | Haiku | ✅ | — |
| D2 | Core switch: all values become `Decimal` | **Opus** | ✅ | arithmetic, rounding |
| D3 | Exact display: format `Decimal` without loss | Sonnet | ✅ | big numbers, cents |
| D4 | Exchange rates as exact decimals | Haiku | ✅ | — (guard) |
| D5 | Cleanup: remove float workarounds, update docs | Haiku | ✅ | — |
| D6 | Performance guard stays green | Sonnet | ✅ | — |

**Model choice:** Haiku for mechanical, local changes with a clear template. Sonnet for normal feature work across 1–2 files. Opus for the one cross-cutting type switch, where all callers have to change at once and the CI must stay green.

**Every step can run in a pipeline.** The step is done when all acceptance tests tagged with its name pass, the tag has been deleted, and `npm run ci` is green. No manual check is needed.

## Design (as simple as possible)

- **One library:** [`decimal.js`](https://mikemcl.github.io/decimal.js/). It also covers `sqrt`, `ln`, `exp`, `sin`… so every existing function has an equivalent. No dependency for its own sake.
- **One module:** `packages/engine/src/num.ts` exports `Decimal` with fixed settings: 40 significant digits, `ROUND_HALF_UP` (rounding as on a German invoice).
- **Only values become `Decimal`:** `NumV.value`, `PctV.value`, unit `factor`/`offset`, exchange rates, constants. **Unit powers and dimensions stay `number`:** they are small exponents, not money.
- **Exact display:** `Intl.NumberFormat.format()` accepts decimal strings, so `formatNumber` passes `d.toFixed()` and nothing is lost.
- **No API change** for the web app: `evaluateDocument()` still returns text.

## Steps

### D1 · `num.ts` — Haiku
- `npm i decimal.js -w @kalkuel/engine`
- `src/num.ts`: `Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })`, export as `Decimal` plus helper `D(x: Decimal.Value)`.
- Test `test/num.test.ts`: `D('0.1').plus('0.2').eq('0.3')`, rounding `D('1.005').toDecimalPlaces(2)` → `1.01`.
- **Done when:** the new test is green and nothing else has changed.

### D2 · Core switch — Opus
One PR, because the type ripples through everything:
- `lexer.ts` `readNumber`: build the number from the digit string with `D(s)`, not `parseFloat`; radix literals via `BigInt`; `k`/`M` scale with `.times()`.
- `parser.ts`: `{ t: 'num'; v: Decimal }`, `SCALE_WORDS` as `Decimal`. Unit powers stay `number` (`.toNumber()` when read).
- `units.ts`: `factor`, `offset` as `Decimal`; define factors as exact strings (`'1609.344'`, °F: `D(5).div(9)`).
- `evaluate.ts`: `addSub`, `mul`, `div`, `mod`, `pow`, `compare`, `convert`, percent operators, `sum`/`avg`, `checkFinite` work on `Decimal`. `round`/`floor`/`ceil` use `toDecimalPlaces(n, mode)`. Math functions map to `Decimal.sqrt/ln/exp/sin/…`. `CONSTANTS` as `Decimal` (`Decimal.acos(-1)` for π).
- `format.ts`: **temporary bridge** `d.toNumber()`, so D3 stays a separate step.
- **Done when:** all `D2` tags are deleted and `npm run ci` is green.

### D3 · Exact display — Sonnet
- `formatNumber(x: Decimal, …)`: drop `toPrecision(12)`; round with `toDecimalPlaces` (4 digits, 6 below 1, currencies by `decimals`), then `Intl.NumberFormat(…).format(d.toFixed())`.
- Show values with `|x| < 1e-30` as `0` (e.g. `sin(pi)`).
- Scientific notation from `d.toExponential(6)`; hex/bin/oct via `BigInt(d.round().toFixed())`.
- **Done when:** all `D3` tags are deleted and `npm run ci` is green.

### D4 · Exchange rates — Haiku
- `setRates(rates: Record<string, Decimal.Value>)`: store each rate as `D(String(rate))`, so `1.0853` does not turn into `1.08529999…`.
- `apps/web/src/rates.ts` stays as it is (JSON numbers are passed through via `String`).
- **Done when:** the `D4` test and the e2e currency test are green.

### D5 · Cleanup — Haiku
- Remove float workarounds that are no longer needed (`1e-9`/`1e-12` comparisons on values, `+ 0` for `-0`).
- Delete the bridge from D2 if any is left; `grep -n "toNumber()" src` should only find unit powers.
- README/SPEC: "exact decimal arithmetic (40 digits)".
- **Done when:** `npm run ci` is green and the diff only removes code.

### D6 · Performance — Sonnet
- `decimal.js` is slower than floats. Guard: 1,000 lines in < 100 ms (test already present).
- Only if it turns red: cache `evaluateDocument` per line (unchanged line + same scope → old result).
- **Done when:** the performance test is green in CI.

## Tests

| Level | Where | What | Runs |
|---|---|---|---|
| Engine (document in → displayed text out) | `packages/engine/test/*.test.ts` | the main oracle; one line per case | `npm test` |
| Browser e2e (Playwright) | `apps/web/e2e/*.spec.ts` | real editor: type, see the result column, theme, exchange rates (mocked) | `npm run test:e2e` |
| Everything | `.github/workflows/ci.yml` | typecheck → engine → e2e on every push/PR | `npm run ci` |

Known bugs are written as tests **before** the fix and carry the tag of the step that fixes them (`bug: 'D2'`). They run as "expected to fail" (`it.fails` / `test.fail`). As soon as a bug is fixed, its test turns red until the tag is deleted. That way, no fix goes unnoticed and no step is done without proof.

## Not part of this roadmap

Dates/times, new functions, a new number format setting. Only the switch.
