# Kalkül – Specification (draft v0.1)

> A Markdown editor that calculates. Notes, headings, lists and tables like in Obsidian/Typora –
> and every calculation line is evaluated live like in Numi.

---

## 1. Goal & scope

**Goal:** A document is plain Markdown (`.md`) and stays readable in any other editor,
but in Kalkül results appear next to calculation lines – live, with units, currencies,
percentages, variables and dates.

**Typical use cases**
- Budget/cost planning with prose around it
- Quotes and project costing (hours × rate, discounts, VAT)
- Travel/moving planning (currencies, distances, time zones)
- Technical notes with unit calculations

**Out of scope (v1):** real-time collaboration, cloud sync, third-party plugins,
symbolic math (CAS), charts.

---

## 2. Core principle: what gets calculated?

This is the central design decision. Proposal: **a hybrid of three mechanisms.**

### 2.1 Auto-detection (default)
Every line outside code blocks that parses **entirely** as an expression is calculated.
Prose is ignored because it doesn't parse.

```markdown
## Rent & utilities

The base rent goes up in January.

rent = 1.250 €                      → 1.250,00 €
utilities = 280 €                   → 280,00 €
rent + utilities                    → 1.530,00 €
prev * 12                           → 18.360,00 €
```

- The result appears **right-aligned** in a result column (like Numi) and is **not** written to the file.
- List items are detected too: `- Hotel: 3 * 89 €` → the label before `:` is ignored (Numi behaviour).

### 2.2 Explicit calculation blocks
```` ```calc ```` blocks force calculation mode for every line (even where detection would be unsure).
In other editors they show up as a normal code block – the file stays clean.

### 2.3 Inline expressions in prose
Syntax: `` `= expression` `` (inline code starting with `=`).

```markdown
The project costs `= hours * rate` in total, which is
`= (hours * rate) / budget as %` of the budget.
```
In the editor the result is shown as a badge right after the expression; in preview/export it replaces it.

### 2.4 Excluded
- Contents of normal code blocks (```` ```js ```` etc.), frontmatter, HTML, links/URLs.
- Lines starting with `//` or `#` (without a space → comment) – optional, see open questions.

---

## 3. Calculation engine (features)

| Area | Examples | Priority |
|---|---|---|
| Basic arithmetic, brackets, powers | `(3 + 4) * 2^3`, `17 mod 5` | MVP |
| Variables | `rate = 95 €/h`, `rate * 40 h` | MVP |
| References | `prev`, `sum`, `total`, `avg` (up to the last blank line / heading) | MVP |
| Percentages | `20 % of 150`, `150 + 19 %`, `50 as % of 200`, `5 % off 80 €` | MVP |
| Units | length, mass, volume, area, time, temperature, data (GB/MB), speed | MVP |
| Conversion | `5 km in miles`, `3 h 20 min in min`, `to`, `as`, `in` | MVP |
| Currencies | `100 USD in EUR`, `€`, `$`, ISO codes; rates from an API, cached offline | MVP |
| Number formats | `in hex`, `in bin`, `in sci`, German notation `1.234,56` switchable | v1 |
| Date & time | `today + 3 weeks`, `days until 24.12.`, `time in Tokyo` | v1 |
| Functions | `round`, `sqrt`, `min/max`, `abs`, `log`, trigonometry | v1 |
| Section scope | `sum` only covers the current heading | v1 |
| Tables | column/row sums in Markdown tables (`=sum(col)` in a cell) | v2 |
| Custom functions/units (JS) | like Numi extensions | v2 |
| Crypto | `0,1 BTC in EUR` | v2 |

**Language:** keywords in English (`in`, `of`, `as`) **and** German (`von`, `in`, `als`, `heute`).

**Error behaviour:** lines that don't parse → no result, no error (prose).
In `calc` blocks → a subtle error icon with a tooltip.

**Dependencies:** when `rent` changes, all dependent lines are recalculated
(the document is evaluated top-down; target < 5 ms for 1,000 lines).

---

## 4. Editor (Markdown)

- **Live preview mode** (like Obsidian): Markdown syntax is visible around the cursor and rendered elsewhere.
- Switchable: *Live preview* / *Source* / *Preview only*.
- CommonMark + GFM: headings, lists, checkboxes, tables, code, quotes, links, images.
- Result column on the right, can be hidden; click a result = copy to clipboard.
- Syntax highlighting for calculation lines (numbers, units, variables, operators in colour).
- Autocompletion for variables, units and currencies.
- Hover over a variable → shows its current value and defining line.
- Keyboard: `Cmd+Enter` inserts the line's result, `Cmd+Shift+C` copies it.

---

## 5. Files & export

- Storage format: plain `.md`, no results in the file (deterministic, Git-friendly).
- Folder as library (sidebar with file tree), full-text search.
- Export: **HTML / PDF** with results filled in, **"baked" Markdown** (results appended as text: `rent + utilities = 1.530,00 €`).
- Optional: frontmatter for document settings
  ```yaml
  ---
  locale: de-DE
  currency: EUR
  precision: 2
  ---
  ```

---

## 6. Technical architecture (proposal)

| Layer | Technology | Reason |
|---|---|---|
| App shell | **Tauri 2** (macOS first, later Win/Linux) | small, fast, native file access |
| UI | TypeScript + React (or Svelte) | |
| Editor | **CodeMirror 6** | decorations/widgets for the result column & live preview, Markdown parser (Lezer) built in |
| Calculation engine | **own parser in TypeScript** (Pratt parser) | Numi syntax (`of`, `in`, `%`, labels) doesn't fit the mathjs grammar |
| Units / numbers | own unit system, `decimal.js` for precision | no float errors with money |
| Currencies | e.g. frankfurter.app / ECB rates, cached daily | free, no API key |

The engine is a **standalone package** (`packages/engine`) without UI dependencies → testable,
and usable later as a CLI or web version.

```
kalkuel/
├─ packages/engine/   # lexer, parser, evaluator, units, currencies (+ tests)
├─ apps/desktop/      # Tauri + CodeMirror editor
└─ SPEC.md
```

---

## 7. Effort estimate

| Package | Content | Effort (1 developer) |
|---|---|---|
| M1 Engine core | lexer/parser, arithmetic, variables, `prev/sum`, percentages, tests | 1–1.5 weeks |
| M2 Units & currencies | unit system, conversion, rates API + cache | 1 week |
| M3 Editor integration | CodeMirror, line detection, result column, highlighting | 1 week |
| M4 Markdown live preview | rendering around the cursor, tables, checkboxes | 1–1.5 weeks |
| M5 Desktop app | Tauri, open/save files, sidebar, settings | 0.5–1 week |
| M6 Date/time, inline expressions, export | | 1–1.5 weeks |
| **Total v1** | | **approx. 6–8 weeks** |

**With me as implementer:** a working **prototype (M1 + M3 + basic Markdown, as a web app)**
is doable in one or a few sessions. Most of the effort lies in the details of the engine
(units, edge cases of the natural syntax) and in polishing the live preview.

**Biggest risks**
1. **Ambiguity of prose vs. calculation** – e.g. `Meeting 3 - 4 pm` would be calculated as `-1`. → heuristics + `calc` blocks as a way out.
2. **German number notation** (`1.234,56` vs. `1,234.56`) – must be unambiguous per document/locale.
3. **Live preview** is the fiddliest part of the UI.

---

## 8. Open questions

1. **Platform:** desktop (Tauri, macOS) first – or rather a web app / PWA?
2. **Auto-detection on by default** – or only `calc` blocks + inline (safer, but less of a "Numi feel")?
3. ~~**Default locale** German or English?~~ Decided: English (`€1,234.56`); German via frontmatter `locale: de`.
4. Should results **optionally be written to the file** (e.g. as `<!-- = 1.530 € -->`)?
5. Comment syntax: Numi uses `#` for headings and `//` for comments – in Markdown `#` is a heading. Proposal: only `//`.

---

## 9. MVP proposal (first milestone)

Web app (Vite + CodeMirror 6), later packaged in Tauri:
- Markdown with highlighting + basic live preview (headings, bold/italic, lists)
- Auto-detection of calculation lines, result column on the right
- Arithmetic, variables, `prev`/`sum`, percentages, basic units, EUR/USD
- Local storage (open/save file)
