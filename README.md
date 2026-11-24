# Kalkül

A Markdown editor that calculates – notes and calculations in one document, inspired by Numi. Prototype. Specification: [SPEC.md](SPEC.md). Next up: [ROADMAP.md](ROADMAP.md).

```bash
npm install
npm run dev        # editor at http://localhost:5173
npm test           # engine tests
npm run test:e2e   # browser tests (Playwright)
npm run ci         # typecheck + all tests, same as GitHub CI
npm run build      # production build to apps/web/dist
```

## Structure

- `packages/engine` – calculation engine without UI (lexer, parser, units, currencies, Markdown line detection)
- `apps/web` – editor (Vite + CodeMirror 6) with live preview, result column, autocompletion, light/dark theme

## What gets calculated

- Every line that reads entirely as a calculation (prose is ignored); `Label: expression` and list items work too
- Every line in ```` ```calc ```` blocks
- Inline in text: `` `= expression` ``
- Variables (`rate = 95 €/h`), `prev`, `sum`/`total`, `avg` (up to the last blank line/heading)
- Percentages (`20 % of 150`, `+ 19 %`, `5 % off`, `50 as % of 200`), units, currencies (ECB rates), `in hex/bin`
- Keywords in English and German (`of`/`von`, `as`/`als`, `sum`/`summe` …)
- Number format English by default (`1,234.56`); frontmatter `locale: de` switches to German (`1.234,56`, function arguments separated with `;`).
