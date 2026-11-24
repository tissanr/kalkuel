# Kalkül – Spezifikation (Entwurf v0.1)

> Ein Markdown-Editor, der rechnet. Notizen, Überschriften, Listen und Tabellen wie in Obsidian/Typora –
> und jede Rechenzeile wird live ausgewertet wie in Numi.

---

## 1. Ziel & Abgrenzung

**Ziel:** Ein Dokument ist ganz normales Markdown (`.md`), bleibt in jedem anderen Editor lesbar,
aber in Kalkül erscheinen neben Rechenzeilen die Ergebnisse – live, mit Einheiten, Währungen,
Prozenten, Variablen und Datum.

**Typische Anwendungsfälle**
- Budget-/Kostenplanung mit Fließtext drumherum
- Angebots- und Projektkalkulation (Stunden × Satz, Rabatte, MwSt.)
- Reise-/Umzugsplanung (Währungen, Entfernungen, Zeitzonen)
- Technische Notizen mit Einheitenrechnung

**Nicht im Scope (v1):** Kollaboration in Echtzeit, Cloud-Sync, Plugins von Drittanbietern,
symbolische Mathematik (CAS), Diagramme.

---

## 2. Grundprinzip: Was wird gerechnet?

Das ist die zentrale Design-Entscheidung. Vorschlag: **Hybrid aus drei Mechanismen.**

### 2.1 Auto-Erkennung (Standard)
Jede Zeile außerhalb von Code-Blöcken, die **vollständig** als Ausdruck parsebar ist, wird gerechnet.
Prosa wird ignoriert, weil sie nicht parst.

```markdown
## Miete & Nebenkosten

Die Kaltmiete steigt ab Januar.

miete = 1.250 €                     → 1.250,00 €
nebenkosten = 280 €                 → 280,00 €
miete + nebenkosten                 → 1.530,00 €
prev * 12                           → 18.360,00 €
```

- Ergebnis erscheint **rechtsbündig** in einer Ergebnisspalte (wie Numi), wird **nicht** in die Datei geschrieben.
- Listenpunkte werden auch erkannt: `- Hotel: 3 * 89 €` → Label vor `:` wird ignoriert (Numi-Verhalten).

### 2.2 Explizite Rechenblöcke
```` ```calc ```` -Blöcke erzwingen Rechenmodus für jede Zeile (auch wenn Erkennung unsicher wäre).
In anderen Editoren erscheinen sie als normaler Code-Block – Datei bleibt sauber.

### 2.3 Inline-Ausdrücke im Fließtext
Syntax: `` `= ausdruck` `` (Inline-Code, beginnt mit `=`).

```markdown
Das Projekt kostet insgesamt `= stunden * satz` und damit
`= (stunden * satz) / budget as %` des Budgets.
```
Im Editor wird das Ergebnis als Badge direkt hinter dem Ausdruck angezeigt; im Preview/Export ersetzt.

### 2.4 Ausgeschlossen
- Inhalte in normalen Code-Blöcken (```` ```js ```` etc.), Frontmatter, HTML, Links/URLs.
- Zeilen, die mit `//` oder `#` (ohne Leerzeichen → Kommentar) beginnen – optional, s. offene Fragen.

---

## 3. Rechen-Engine (Funktionsumfang)

| Bereich | Beispiele | Priorität |
|---|---|---|
| Grundrechenarten, Klammern, Potenzen | `(3 + 4) * 2^3`, `17 mod 5` | MVP |
| Variablen | `satz = 95 €/h`, `satz * 40 h` | MVP |
| Bezüge | `prev`, `sum`, `total`, `avg` (bis zur letzten Leerzeile / Überschrift) | MVP |
| Prozent | `20 % of 150`, `150 + 19 %`, `50 as % of 200`, `5 % off 80 €` | MVP |
| Einheiten | Länge, Masse, Volumen, Fläche, Zeit, Temperatur, Daten (GB/MB), Geschwindigkeit | MVP |
| Umrechnung | `5 km in miles`, `3 h 20 min in min`, `to`, `as`, `in` | MVP |
| Währungen | `100 USD in EUR`, `€`, `$`, ISO-Codes; Kurse von API, offline gecacht | MVP |
| Zahlenformate | `in hex`, `in bin`, `in sci`, deutsche Notation `1.234,56` umschaltbar | v1 |
| Datum & Zeit | `today + 3 weeks`, `days until 24.12.`, `time in Tokyo` | v1 |
| Funktionen | `round`, `sqrt`, `min/max`, `abs`, `log`, Trigonometrie | v1 |
| Abschnitts-Scope | `sum` bezieht sich nur auf aktuelle Überschrift | v1 |
| Tabellen | Spalten-/Zeilensummen in Markdown-Tabellen (`=sum(col)` in Zelle) | v2 |
| Eigene Funktionen/Einheiten (JS) | wie Numi-Extensions | v2 |
| Krypto | `0,1 BTC in EUR` | v2 |

**Sprache:** Schlüsselwörter Englisch (`in`, `of`, `as`) **und** Deutsch (`von`, `in`, `als`, `heute`).

**Fehlerverhalten:** Nicht parsebare Zeilen → kein Ergebnis, kein Fehler (Prosa).
In `calc`-Blöcken → dezentes Fehler-Icon mit Tooltip.

**Abhängigkeiten:** Wenn sich `miete` ändert, werden alle abhängigen Zeilen neu berechnet
(Dokument wird top-down ausgewertet; < 5 ms bei 1.000 Zeilen als Ziel).

---

## 4. Editor (Markdown)

- **Live-Preview-Modus** (wie Obsidian): Markdown-Syntax wird um den Cursor herum sichtbar, sonst gerendert.
- Umschaltbar: *Live Preview* / *Quelltext* / *Nur Vorschau*.
- CommonMark + GFM: Überschriften, Listen, Checkboxen, Tabellen, Code, Zitate, Links, Bilder.
- Ergebnisspalte rechts, ausblendbar; Klick auf Ergebnis = in Zwischenablage kopieren.
- Syntax-Highlighting für Rechenzeilen (Zahlen, Einheiten, Variablen, Operatoren farbig).
- Autovervollständigung für Variablen, Einheiten und Währungen.
- Hover über Variable → zeigt aktuellen Wert und Definitionszeile.
- Tastatur: `Cmd+Enter` Ergebnis der Zeile einfügen, `Cmd+Shift+C` Ergebnis kopieren.

---

## 5. Dateien & Export

- Speicherformat: reines `.md`, keine Ergebnisse in der Datei (deterministisch, Git-freundlich).
- Ordner als Bibliothek (Sidebar mit Dateibaum), Volltextsuche.
- Export: **HTML / PDF** mit eingesetzten Ergebnissen, **Markdown „gebacken“** (Ergebnisse als Text angehängt: `miete + nebenkosten = 1.530,00 €`).
- Optional: Frontmatter für Dokument-Einstellungen
  ```yaml
  ---
  locale: de-DE
  currency: EUR
  precision: 2
  ---
  ```

---

## 6. Technische Architektur (Vorschlag)

| Schicht | Technologie | Begründung |
|---|---|---|
| App-Hülle | **Tauri 2** (macOS zuerst, später Win/Linux) | klein, schnell, native Dateizugriffe |
| UI | TypeScript + React (oder Svelte) | |
| Editor | **CodeMirror 6** | Decorations/Widgets für Ergebnisspalte & Live Preview, Markdown-Parser (Lezer) eingebaut |
| Rechen-Engine | **eigener Parser in TypeScript** (Pratt-Parser) | Numi-Syntax (`of`, `in`, `%`, Labels) passt nicht in mathjs-Grammatik |
| Einheiten / Zahlen | eigenes Einheitensystem, `decimal.js` für Präzision | keine Float-Fehler bei Geld |
| Währungen | z. B. frankfurter.app / EZB-Kurse, täglich gecacht | kostenlos, ohne API-Key |

Die Engine ist ein **eigenständiges Paket** (`packages/engine`) ohne UI-Abhängigkeit → testbar,
später auch als CLI oder Web-Version nutzbar.

```
kalkuel/
├─ packages/engine/   # Lexer, Parser, Evaluator, Units, Currencies (+ Tests)
├─ apps/desktop/      # Tauri + CodeMirror-Editor
└─ SPEC.md
```

---

## 7. Aufwandsschätzung

| Paket | Inhalt | Aufwand (1 Entwickler) |
|---|---|---|
| M1 Engine-Kern | Lexer/Parser, Arithmetik, Variablen, `prev/sum`, Prozent, Tests | 1–1,5 Wochen |
| M2 Einheiten & Währungen | Einheitensystem, Umrechnung, Kurs-API + Cache | 1 Woche |
| M3 Editor-Integration | CodeMirror, Zeilenerkennung, Ergebnisspalte, Highlighting | 1 Woche |
| M4 Markdown Live Preview | Rendering um den Cursor, Tabellen, Checkboxen | 1–1,5 Wochen |
| M5 Desktop-App | Tauri, Dateien öffnen/speichern, Sidebar, Einstellungen | 0,5–1 Woche |
| M6 Datum/Zeit, Inline-Ausdrücke, Export | | 1–1,5 Wochen |
| **Summe v1** | | **ca. 6–8 Wochen** |

**Mit mir als Umsetzer:** Ein lauffähiger **Prototyp (M1 + M3 + einfaches Markdown, als Web-App)**
ist in einer oder wenigen Sessions machbar. Der größte Aufwand steckt in den Details der Engine
(Einheiten, Grenzfälle der natürlichen Syntax) und im Feinschliff der Live Preview.

**Größte Risiken**
1. **Mehrdeutigkeit Prosa vs. Rechnung** – z. B. `Termin 3 - 4 Uhr` würde als `-1` gerechnet. → Heuristik + `calc`-Blöcke als Ausweg.
2. **Deutsche Zahlennotation** (`1.234,56` vs. `1,234.56`) – muss pro Dokument/Locale eindeutig sein.
3. **Live Preview** ist UI-technisch der fummeligste Teil.

---

## 8. Offene Fragen

1. **Plattform:** Desktop (Tauri, macOS) zuerst – oder lieber Web-App / PWA?
2. **Auto-Erkennung standardmäßig an** – oder nur `calc`-Blöcke + Inline (sicherer, aber weniger „Numi-Feeling“)?
3. **Standard-Locale** Deutsch (`1.234,56 €`) oder Englisch?
4. Sollen Ergebnisse **optional in die Datei** geschrieben werden können (z. B. als `<!-- = 1.530 € -->`)?
5. Kommentar-Syntax: Numi nutzt `#` für Überschriften und `//` für Kommentare – in Markdown ist `#` eine Überschrift. Vorschlag: nur `//`.

---

## 9. MVP-Vorschlag (erster Meilenstein)

Web-App (Vite + CodeMirror 6), später in Tauri verpackt:
- Markdown mit Highlighting + einfacher Live Preview (Überschriften, Fett/Kursiv, Listen)
- Auto-Erkennung von Rechenzeilen, Ergebnisspalte rechts
- Arithmetik, Variablen, `prev`/`sum`, Prozent, Basiseinheiten, EUR/USD
- Lokale Speicherung (Datei öffnen/speichern)
