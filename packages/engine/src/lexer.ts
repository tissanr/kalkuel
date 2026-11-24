export type Locale = 'de' | 'en';

export interface Token {
  type: 'num' | 'ident' | 'op' | 'eof';
  value: string;
  num?: number;
  from: number;
  to: number;
}

export class CalcSyntaxError extends Error {}

const IDENT_START = /[\p{L}_°]/u;
const IDENT_CONT = /[\p{L}\p{N}_²³°]/u;
export const CURRENCY_SYMBOLS = '€$£¥';

const OPS: Record<string, string> = {
  '+': '+', '-': '-', '−': '-', '–': '-',
  '*': '*', '×': '*', '·': '*', '/': '/', '÷': '/',
  '^': '^', '(': '(', ')': ')', '=': '=', ',': ',', ';': ';', '%': '%', ':': ':',
};

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';

/**
 * Reads a number. Locale `de`: `1.234,56` (a dot followed by exactly three digits is a
 * thousands separator, otherwise a decimal point, so `1.5` also works).
 * Locale `en`: `1,234.56`.
 */
function readNumber(src: string, start: number, locale: Locale): { num: number; end: number } {
  const radix = /^0([xX][0-9a-fA-F]+|[bB][01]+|[oO][0-7]+)/.exec(src.slice(start));
  if (radix) {
    const base = { x: 16, b: 2, o: 8 }[radix[1][0].toLowerCase() as 'x' | 'b' | 'o'];
    return { num: parseInt(radix[1].slice(1), base), end: start + radix[0].length };
  }
  const group = locale === 'de' ? '.' : ',';
  const dec = locale === 'de' ? ',' : '.';
  let i = start;
  let s = '';
  while (isDigit(src[i])) s += src[i++];
  while (src[i] === group && isDigit(src[i + 1]) && isDigit(src[i + 2]) && isDigit(src[i + 3]) && !isDigit(src[i + 4])) {
    s += src.slice(i + 1, i + 4);
    i += 4;
  }
  if ((src[i] === dec || (locale === 'de' && src[i] === '.')) && isDigit(src[i + 1])) {
    s += '.';
    i++;
    while (isDigit(src[i])) s += src[i++];
  }
  if ((src[i] === 'e' || src[i] === 'E') && (isDigit(src[i + 1]) || ((src[i + 1] === '+' || src[i + 1] === '-') && isDigit(src[i + 2])))) {
    s += 'e' + src[i + 1];
    i += 2;
    while (isDigit(src[i])) s += src[i++];
  }
  let num = parseFloat(s);
  // Directly attached scale suffix: 5k, 2M
  if ((src[i] === 'k' || src[i] === 'M') && !IDENT_CONT.test(src[i + 1] ?? '')) {
    num *= src[i] === 'k' ? 1e3 : 1e6;
    i++;
  }
  return { num, end: i };
}

export function lex(src: string, locale: Locale): Token[] {
  const toks: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (isDigit(c)) {
      const { num, end } = readNumber(src, i, locale);
      toks.push({ type: 'num', value: src.slice(i, end), num, from: i, to: end });
      i = end;
      continue;
    }
    if (CURRENCY_SYMBOLS.includes(c)) {
      toks.push({ type: 'ident', value: c, from: i, to: i + 1 });
      i++;
      continue;
    }
    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < src.length && IDENT_CONT.test(src[j])) j++;
      toks.push({ type: 'ident', value: src.slice(i, j), from: i, to: j });
      i = j;
      continue;
    }
    if (c === '*' && src[i + 1] === '*') {
      toks.push({ type: 'op', value: '^', from: i, to: i + 2 });
      i += 2;
      continue;
    }
    const op = OPS[c];
    if (op) {
      toks.push({ type: 'op', value: op, from: i, to: i + 1 });
      i++;
      continue;
    }
    throw new CalcSyntaxError(`Unexpected character "${c}"`);
  }
  toks.push({ type: 'eof', value: '', from: src.length, to: src.length });
  return toks;
}
