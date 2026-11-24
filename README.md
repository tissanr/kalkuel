# Kalkül

Markdown-Editor, der rechnet – Notizen und Rechnungen in einem Dokument, inspiriert von Numi. Prototyp. Spezifikation: [SPEC.md](SPEC.md).

```bash
npm install
npm run dev     # Editor auf http://localhost:5173
npm test        # Engine-Tests
npm run build   # Produktions-Build nach apps/web/dist
```

## Aufbau

- `packages/engine` – Rechen-Engine ohne UI (Lexer, Parser, Einheiten, Währungen, Markdown-Zeilenerkennung)
- `apps/web` – Editor (Vite + CodeMirror 6) mit Live Preview, Ergebnisspalte, Autovervollständigung

## Was gerechnet wird

- Jede Zeile, die vollständig als Rechnung lesbar ist (Prosa wird ignoriert); `Label: ausdruck` und Listenpunkte gehen auch
- Jede Zeile in ```` ```calc ````-Blöcken
- Inline im Text: `` `= ausdruck` ``
- Variablen (`satz = 95 €/h`), `prev`, `sum`/`gesamt`, `avg` (bis zur letzten Leerzeile/Überschrift)
- Prozent (`20 % von 150`, `+ 19 %`, `5 % off`, `50 als % von 200`), Einheiten, Währungen (EZB-Kurse), `in hex/bin`
- Zahlenformat Deutsch (`1.234,56`); per Frontmatter `locale: en` umschaltbar. Funktionsargumente mit `;` oder `, ` trennen.
