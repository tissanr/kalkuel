import { checkFinite, createScope, evaluate, FUNCTIONS, isSpecialWord, type Scope, type Value } from './evaluate';
import { formatValue } from './format';
import { lex, type Locale, type Token } from './lexer';
import { FMT_WORDS, KEYWORDS, parse, SCALE_WORDS, type Node } from './parser';
import { lookupUnit } from './units';

export type SpanType = 'number' | 'unit' | 'variable' | 'keyword' | 'function' | 'operator';

/** Offsets are relative to the start of the line. */
export interface Span {
  from: number;
  to: number;
  type: SpanType;
}

export interface InlineResult {
  from: number;
  to: number;
  text?: string;
  error?: string;
}

export interface LineResult {
  mode: 'auto' | 'calc' | 'inline';
  text?: string;
  error?: string;
  value?: Value;
  spans: Span[];
  inline: InlineResult[];
  assigned?: string;
}

export interface VarInfo {
  line: number;
  text: string;
}

export interface DocResult {
  /** Indexed by 0-based line number; undefined for prose lines. */
  lines: (LineResult | undefined)[];
  vars: Map<string, VarInfo>;
  locale: Locale;
}

export interface DocOptions {
  locale?: Locale;
}

const CALC_LANGS = new Set(['calc', 'kalkuel', 'kalkül', 'math']);
const LABEL_RE = /^([^:=`]*\p{L}[^:=`]*):[*_]*[ \t]+/u;
const PREFIX_RE = /^(\s*(?:>\s?)*)(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?/;
const INLINE_RE = /`=\s*([^`]+)`/g;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)/;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function stripComment(text: string): string {
  const m = /(^|\s)\/\//.exec(text);
  return m ? text.slice(0, m.index) : text;
}

function classify(tokens: Token[], offset: number, scope: Scope): Span[] {
  const spans: Span[] = [];
  tokens.forEach((t, i) => {
    let type: SpanType | undefined;
    if (t.type === 'num') type = 'number';
    else if (t.type === 'op') type = t.value === '(' || t.value === ')' ? undefined : 'operator';
    else if (t.type === 'ident') {
      if (KEYWORDS.has(t.value) || FMT_WORDS.has(t.value) || SCALE_WORDS[t.value]) type = 'keyword';
      else if (FUNCTIONS[t.value.toLowerCase()] && tokens[i + 1]?.value === '(') type = 'function';
      else if (scope.vars.has(t.value) || isSpecialWord(t.value)) type = 'variable';
      else if (lookupUnit(t.value)) type = 'unit';
    }
    if (type) spans.push({ from: t.from + offset, to: t.to + offset, type });
  });
  return spans;
}

interface Outcome {
  value?: Value;
  error?: string;
  spans: Span[];
  assigned?: string;
}

/**
 * Evaluates one expression. Returns undefined if the text is prose (only in auto mode).
 */
function evalExpr(text: string, offset: number, scope: Scope, locale: Locale, mode: LineResult['mode']): Outcome | undefined {
  const attempt = (src: string) => {
    const tokens = lex(src, locale);
    return { tokens, node: parse(tokens) };
  };
  let parsed: { tokens: Token[]; node: Node } | undefined;
  let parseError: string | undefined;
  let off = offset;
  try {
    parsed = attempt(text);
  } catch (e) {
    parseError = msg(e);
    const m = LABEL_RE.exec(text);
    if (m) {
      try {
        parsed = attempt(text.slice(m[0].length));
        off = offset + m[0].length;
        parseError = undefined;
      } catch {
        /* keep first error */
      }
    }
  }
  if (!parsed) return mode === 'auto' ? undefined : { error: parseError ?? 'Syntaxfehler', spans: [] };

  const { tokens, node } = parsed;
  if (mode === 'auto') {
    const substantial = tokens.some((t) => t.type === 'num' || (t.type === 'ident' && (scope.vars.has(t.value) || isSpecialWord(t.value))));
    if (!substantial) return undefined;
  }
  try {
    const value = checkFinite(evaluate(node, scope));
    return { value, spans: classify(tokens, off, scope), assigned: node.t === 'assign' ? node.name : undefined };
  } catch (e) {
    // In auto mode only complain when the line clearly is meant as a calculation.
    const looksLikeCalc = tokens.some(
      (t) => (t.type === 'op' && t.value !== '(' && t.value !== ')') || (t.type === 'ident' && KEYWORDS.has(t.value)),
    );
    if (mode === 'auto' && !looksLikeCalc) return undefined;
    return { error: msg(e), spans: classify(tokens, off, scope) };
  }
}

function readFrontmatter(lines: string[]): { end: number; locale?: Locale } {
  if (lines[0]?.trim() !== '---') return { end: 0 };
  for (let j = 1; j < lines.length; j++) {
    if (lines[j].trim() === '---' || lines[j].trim() === '...') {
      let locale: Locale | undefined;
      for (const l of lines.slice(1, j)) {
        const m = /^locale:\s*["']?([\w-]+)/.exec(l.trim());
        if (m) locale = m[1].toLowerCase().startsWith('en') ? 'en' : 'de';
      }
      return { end: j + 1, locale };
    }
  }
  return { end: 0 };
}

export function evaluateDocument(src: string, opts: DocOptions = {}): DocResult {
  const lines = src.split('\n');
  const fm = readFrontmatter(lines);
  const locale: Locale = fm.locale ?? opts.locale ?? 'de';
  const result: DocResult = { lines: new Array(lines.length), vars: new Map(), locale };
  const scope = createScope();
  let fence: { marker: string; calc: boolean } | undefined;

  const record = (i: number, mode: LineResult['mode'], o: Outcome) => {
    const lr: LineResult = { mode, spans: o.spans, inline: [], value: o.value, assigned: o.assigned, error: o.error };
    if (o.value) {
      lr.text = formatValue(o.value, locale);
      scope.prev = o.value;
      scope.block.push(o.value);
      if (o.assigned) result.vars.set(o.assigned, { line: i, text: lr.text });
    }
    result.lines[i] = lr;
  };

  for (let i = fm.end; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = FENCE_RE.exec(line);

    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence.marker[0] && fenceMatch[1].length >= fence.marker.length && line.trim() === fenceMatch[1]) {
        fence = undefined;
        scope.block = [];
        continue;
      }
      if (!fence.calc) continue;
      const body = stripComment(line);
      if (!body.trim()) {
        if (!line.trim()) scope.block = [];
        continue;
      }
      const o = evalExpr(body, 0, scope, locale, 'calc');
      if (o) record(i, 'calc', o);
      continue;
    }

    if (fenceMatch) {
      fence = { marker: fenceMatch[1], calc: CALC_LANGS.has(fenceMatch[2].toLowerCase()) };
      scope.block = [];
      continue;
    }
    if (!line.trim() || /^\s{0,3}#{1,6}(\s|$)/.test(line)) {
      scope.block = [];
      continue;
    }
    if (/^\s*[|<]/.test(line) || /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) continue;

    // Inline expressions: `= expr`
    if (line.includes('`')) {
      const inline: InlineResult[] = [];
      const spans: Span[] = [];
      for (const m of line.matchAll(INLINE_RE)) {
        const start = m.index! + m[0].indexOf(m[1]);
        const o = evalExpr(m[1], start, scope, locale, 'inline')!;
        spans.push(...o.spans);
        inline.push({ from: m.index!, to: m.index! + m[0].length, text: o.value ? formatValue(o.value, locale) : undefined, error: o.error });
      }
      if (inline.length) result.lines[i] = { mode: 'inline', spans, inline };
      continue;
    }

    const prefix = PREFIX_RE.exec(line)![0].length;
    const body = stripComment(line.slice(prefix));
    if (!body.trim()) continue;
    const o = evalExpr(body, prefix, scope, locale, 'auto');
    if (o) record(i, 'auto', o);
  }
  return result;
}
