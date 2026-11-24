import { CalcSyntaxError, CURRENCY_SYMBOLS, type Token } from './lexer';
import { eqDims, lookupUnit, termsDims, type UnitTerm } from './units';

export type Fmt = 'hex' | 'bin' | 'oct' | 'sci' | 'dec';

export type Target =
  | { kind: 'unit'; terms: UnitTerm[] }
  | { kind: 'pct' }
  | { kind: 'fmt'; fmt: Fmt };

export type Node =
  | { t: 'num'; v: number }
  | { t: 'unit'; e: Node; terms: UnitTerm[] }
  | { t: 'ident'; name: string }
  | { t: 'call'; name: string; args: Node[] }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^' | 'mod'; l: Node; r: Node }
  | { t: 'neg'; e: Node }
  | { t: 'pct'; e: Node }
  | { t: 'pctop'; op: 'of' | 'off' | 'on'; l: Node; r: Node }
  | { t: 'conv'; e: Node; target: Target }
  | { t: 'asPctOf'; l: Node; r: Node }
  | { t: 'assign'; name: string; e: Node };

export const CONV_WORDS = new Set(['in', 'to', 'as', 'als', 'into']);
export const PCTOP_WORDS: Record<string, 'of' | 'off' | 'on'> = { of: 'of', von: 'of', off: 'off', on: 'on', auf: 'on' };
export const FMT_WORDS = new Set<string>(['hex', 'bin', 'oct', 'sci', 'dec']);
export const SCALE_WORDS: Record<string, number> = {
  Tsd: 1e3, tsd: 1e3, thousand: 1e3, Tausend: 1e3,
  Mio: 1e6, mio: 1e6, million: 1e6, millions: 1e6, Million: 1e6, Millionen: 1e6,
  Mrd: 1e9, mrd: 1e9, billion: 1e9, Milliarde: 1e9, Milliarden: 1e9,
};
export const KEYWORDS = new Set<string>([...CONV_WORDS, ...Object.keys(PCTOP_WORDS), 'mod']);

class Parser {
  i = 0;
  constructor(private toks: Token[]) {}

  peek(o = 0): Token {
    return this.toks[Math.min(this.i + o, this.toks.length - 1)];
  }
  next(): Token {
    return this.toks[this.i++];
  }
  isOp(v: string, o = 0) {
    const t = this.peek(o);
    return t.type === 'op' && t.value === v;
  }
  isWord(set: { has(k: string): boolean }, o = 0) {
    const t = this.peek(o);
    return t.type === 'ident' && set.has(t.value);
  }
  fail(msg?: string): never {
    const t = this.peek();
    throw new CalcSyntaxError(msg ?? (t.type === 'eof' ? 'Ausdruck unvollständig' : `Unerwartet: „${t.value}“`));
  }

  statement(): Node {
    let node: Node;
    if (this.peek().type === 'ident' && this.isOp('=', 1) && !KEYWORDS.has(this.peek().value)) {
      const name = this.next().value;
      this.next();
      node = { t: 'assign', name, e: this.conversion() };
    } else {
      node = this.conversion();
    }
    if (this.peek().type !== 'eof') this.fail();
    return node;
  }

  conversion(): Node {
    let e = this.additive();
    while (this.isWord(CONV_WORDS)) {
      this.next();
      if (this.isOp('%')) {
        this.next();
        if (this.isWord({ has: (k: string) => PCTOP_WORDS[k] === 'of' })) {
          this.next();
          e = { t: 'asPctOf', l: e, r: this.additive() };
        } else {
          e = { t: 'conv', e, target: { kind: 'pct' } };
        }
      } else if (this.isWord(FMT_WORDS)) {
        e = { t: 'conv', e, target: { kind: 'fmt', fmt: this.next().value as Fmt } };
      } else {
        e = { t: 'conv', e, target: { kind: 'unit', terms: this.unitExpr() } };
      }
    }
    return e;
  }

  additive(): Node {
    let l = this.multiplicative();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next().value as '+' | '-';
      l = { t: 'bin', op, l, r: this.multiplicative() };
    }
    return l;
  }

  multiplicative(): Node {
    let l = this.pctOp();
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = this.next().value as '*' | '/';
        l = { t: 'bin', op, l, r: this.pctOp() };
      } else if (this.isWord(new Set(['mod']))) {
        this.next();
        l = { t: 'bin', op: 'mod', l, r: this.pctOp() };
      } else return l;
    }
  }

  pctOp(): Node {
    const l = this.unary();
    const t = this.peek();
    if (t.type === 'ident' && PCTOP_WORDS[t.value]) {
      this.next();
      return { t: 'pctop', op: PCTOP_WORDS[t.value], l, r: this.unary() };
    }
    return l;
  }

  unary(): Node {
    if (this.isOp('-')) {
      this.next();
      return { t: 'neg', e: this.unary() };
    }
    if (this.isOp('+')) {
      this.next();
      return this.unary();
    }
    return this.power();
  }

  power(): Node {
    const b = this.postfix();
    if (this.isOp('^')) {
      this.next();
      return { t: 'bin', op: '^', l: b, r: this.unary() };
    }
    return b;
  }

  postfix(): Node {
    let e = this.primary();
    while (this.isOp('%')) {
      this.next();
      e = { t: 'pct', e };
    }
    return e;
  }

  primary(): Node {
    const t = this.peek();
    if (t.type === 'num') {
      this.next();
      let node: Node = { t: 'num', v: t.num! };
      const s = this.peek();
      if (s.type === 'ident' && SCALE_WORDS[s.value]) {
        this.next();
        node = { t: 'num', v: t.num! * SCALE_WORDS[s.value] };
      }
      if (this.isOp('(')) return { t: 'bin', op: '*', l: node, r: this.primary() };
      const terms = this.attachedUnit();
      if (!terms) return node;
      node = { t: 'unit', e: node, terms };
      // Compound quantities like "3 h 20 min"
      while (terms.length === 1 && this.peek().type === 'num' && this.peek(1).type === 'ident') {
        const u2 = lookupUnit(this.peek(1).value);
        if (!u2 || KEYWORDS.has(this.peek(1).value) || !eqDims(termsDims(terms), u2.dims)) break;
        const n2 = this.next();
        this.next();
        node = { t: 'bin', op: '+', l: node, r: { t: 'unit', e: { t: 'num', v: n2.num! }, terms: [{ unit: u2, power: 1 }] } };
      }
      return node;
    }
    if (t.type === 'ident') {
      if (CURRENCY_SYMBOLS.includes(t.value) && this.peek(1).type === 'num') {
        this.next();
        const n = this.next();
        return { t: 'unit', e: { t: 'num', v: n.num! }, terms: [{ unit: lookupUnit(t.value)!, power: 1 }] };
      }
      if (KEYWORDS.has(t.value)) this.fail();
      this.next();
      if (this.isOp('(')) {
        this.next();
        const args: Node[] = [];
        if (!this.isOp(')')) {
          for (;;) {
            args.push(this.conversion());
            if (this.isOp(';') || this.isOp(',')) {
              this.next();
              continue;
            }
            break;
          }
        }
        if (!this.isOp(')')) this.fail('„)“ fehlt');
        this.next();
        return { t: 'call', name: t.value, args };
      }
      return { t: 'ident', name: t.value };
    }
    if (this.isOp('(')) {
      this.next();
      const e = this.conversion();
      if (!this.isOp(')')) this.fail('„)“ fehlt');
      this.next();
      return e;
    }
    this.fail();
  }

  /** Unit directly following a number, e.g. "5 km" or "3 m^2". */
  attachedUnit(): UnitTerm[] | undefined {
    const t = this.peek();
    if (t.type !== 'ident' || KEYWORDS.has(t.value)) return undefined;
    const u = lookupUnit(t.value);
    if (!u) return undefined;
    this.next();
    let power = 1;
    if (this.isOp('^') && this.peek(1).type === 'num') {
      this.next();
      power = this.next().num!;
    }
    return [{ unit: u, power }];
  }

  /** Conversion target such as "km/h", "m^2" or "EUR". */
  unitExpr(): UnitTerm[] {
    const terms: UnitTerm[] = [];
    let sign = 1;
    for (;;) {
      const t = this.peek();
      const u = t.type === 'ident' ? lookupUnit(t.value) : undefined;
      if (!u) this.fail(t.type === 'ident' ? `Unbekannte Einheit „${t.value}“` : undefined);
      this.next();
      let p = 1;
      if (this.isOp('^') && this.peek(1).type === 'num') {
        this.next();
        p = this.next().num!;
      }
      terms.push({ unit: u, power: p * sign });
      if (this.isOp('/')) {
        this.next();
        sign = -1;
        continue;
      }
      if (this.isOp('*')) {
        this.next();
        continue;
      }
      return terms;
    }
  }
}

export function parse(tokens: Token[]): Node {
  return new Parser(tokens).statement();
}
