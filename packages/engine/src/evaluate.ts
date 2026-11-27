import { D, Decimal, type DecimalValue, type Rounding } from './num';
import type { Fmt, Node, Target } from './parser';
import {
  dimsKey, eqDims, isDimless, lookupUnit, mulDims, scaleDims, termsDims, termsFactor,
  type Dims, type UnitTerm,
} from './units';

export interface NumV {
  kind: 'num';
  /** Value in base units. */
  value: Decimal;
  dims: Dims;
  /** Units used for display. */
  display: UnitTerm[];
  fmt?: Exclude<Fmt, 'dec'>;
  /** A bare unit like the "h" in "€/h": dividing by it keeps both units (rate). */
  bare?: boolean;
}
export interface PctV {
  kind: 'pct';
  value: Decimal;
}
export type Value = NumV | PctV;

export class CalcError extends Error {}

export interface Scope {
  vars: Map<string, Value>;
  prev?: Value;
  /** Results since the last blank line / heading, for sum and avg. */
  block: Value[];
}

export const createScope = (): Scope => ({ vars: new Map(), block: [] });

export const plain = (v: DecimalValue): NumV => ({ kind: 'num', value: D(v), dims: {}, display: [] });
const pct = (v: Decimal): PctV => ({ kind: 'pct', value: v });
export const isPlain = (v: Value): boolean => v.kind === 'num' && isDimless(v.dims) && v.display.length === 0;

const PI = Decimal.acos(-1);
export const CONSTANTS: Record<string, Decimal> = { pi: PI, π: PI, e: Decimal.exp(1), tau: PI.times(2) };
export const PREV_WORDS = ['prev', 'ans', 'vorher'];
export const SUM_WORDS = ['sum', 'total', 'summe', 'gesamt'];
export const AVG_WORDS = ['avg', 'average', 'mean', 'schnitt', 'durchschnitt'];
const SPECIAL = new Set([...PREV_WORDS, ...SUM_WORDS, ...AVG_WORDS]);
export const isSpecialWord = (w: string) => SPECIAL.has(w.toLowerCase()) || w in CONSTANTS;

// ---------------------------------------------------------------------------
// Unit-aware helpers

const hasOffset = (terms: UnitTerm[]) => terms.length === 1 && terms[0].power === 1 && terms[0].unit.offset !== undefined;

export function toDisplay(n: NumV, terms: UnitTerm[] = n.display): Decimal {
  if (hasOffset(terms)) return n.value.minus(terms[0].unit.offset!).div(terms[0].unit.factor);
  return n.value.div(termsFactor(terms));
}

export function fromDisplay(v: Decimal, terms: UnitTerm[]): NumV {
  const dims = termsDims(terms);
  if (hasOffset(terms)) return { kind: 'num', value: v.times(terms[0].unit.factor).plus(terms[0].unit.offset!), dims, display: terms };
  return { kind: 'num', value: v.times(termsFactor(terms)), dims, display: terms };
}

function mapDisplay(n: Value, f: (x: Decimal) => Decimal): Value {
  if (n.kind === 'pct') return pct(f(n.value));
  return { ...fromDisplay(f(toDisplay(n)), n.display), fmt: n.fmt };
}

/**
 * Merge identical units; with `byDims` also units of the same dimension (h·min⁻¹ → cancels).
 */
function simplify(terms: UnitTerm[], byDims = true): UnitTerm[] {
  let exact: UnitTerm[] = [];
  const expanded = terms.flatMap((t) => (t.unit.expand ? [{ unit: t.unit.expand.unit, power: t.unit.expand.power * t.power }] : [t]));
  for (const t of expanded) {
    const e = exact.find((x) => x.unit === t.unit);
    if (e) e.power += t.power;
    else exact.push({ ...t });
  }
  exact = exact.filter((t) => Math.abs(t.power) > 1e-12);
  // Cancel physically identical terms written differently, e.g. m^2 and m²⁻¹.
  for (let i = 0; i < exact.length; i++) {
    const a = exact[i];
    const j = exact.findIndex(
      (b, k) =>
        k !== i &&
        Math.sign(b.power) !== Math.sign(a.power) &&
        eqDims(scaleDims(a.unit.dims, a.power), scaleDims(b.unit.dims, -b.power)) &&
        a.unit.factor.pow(a.power).times(b.unit.factor.pow(b.power)).minus(1).abs().lt(1e-9),
    );
    if (j >= 0) {
      exact = exact.filter((_, k) => k !== i && k !== j);
      i = -1;
    }
  }
  if (!byDims) return exact;
  const out: UnitTerm[] = [];
  for (const t of exact) {
    if (Math.abs(t.power) < 1e-12) continue;
    const k = dimsKey(t.unit.dims);
    const e = out.find((x) => dimsKey(x.unit.dims) === k);
    if (e) e.power += t.power;
    else out.push({ ...t });
  }
  return out.filter((t) => Math.abs(t.power) > 1e-12);
}

function displayIn(n: NumV, terms: UnitTerm[]): Decimal {
  if (isPlain(n)) return n.value;
  if (!eqDims(n.dims, termsDims(terms))) throw new CalcError('Units do not match');
  return toDisplay(n, terms);
}

function addSub(a: Value, b: Value, sign: 1 | -1): Value {
  if (a.kind === 'pct' && b.kind === 'pct') return pct(a.value.plus(b.value.times(sign)));
  if (a.kind === 'num' && b.kind === 'pct') {
    const f = b.value.times(sign).div(100).plus(1);
    return mapDisplay(a, (x) => x.times(f));
  }
  if (a.kind === 'pct' || b.kind === 'pct') throw new CalcError('Cannot combine a percentage and a number like this');
  const terms = a.display.length ? a.display : b.display;
  return { ...fromDisplay(displayIn(a, terms).plus(displayIn(b, terms).times(sign)), terms), fmt: a.fmt ?? b.fmt };
}

function mul(a: Value, b: Value): Value {
  if (a.kind === 'pct' && b.kind === 'pct') return pct(a.value.times(b.value).div(100));
  if (a.kind === 'pct') return mul(plain(a.value.div(100)), b);
  if (b.kind === 'pct') return mul(a, plain(b.value.div(100)));
  if (isPlain(b)) return mapDisplay(a, (x) => x.times(b.value));
  if (isPlain(a)) return mapDisplay(b, (x) => x.times(a.value));
  return { kind: 'num', value: a.value.times(b.value), dims: mulDims(a.dims, b.dims), display: simplify([...a.display, ...b.display]) };
}

function div(a: Value, b: Value): Value {
  if (b.kind === 'pct') {
    if (a.kind === 'pct') return plain(a.value.div(b.value));
    return div(a, plain(b.value.div(100)));
  }
  if (b.value.isZero()) throw new CalcError('Division by zero');
  if (isPlain(b)) return mapDisplay(a, (x) => x.div(b.value));
  if (a.kind === 'pct') throw new CalcError('Invalid percentage calculation');
  return {
    kind: 'num',
    value: a.value.div(b.value),
    dims: mulDims(a.dims, b.dims, -1),
    display: simplify([...a.display, ...b.display.map((t) => ({ unit: t.unit, power: -t.power }))], !b.bare),
  };
}

function pow(a: Value, b: Value): Value {
  if (!isPlain(b)) throw new CalcError('Exponent must be a number without a unit');
  const n = b.value;
  if (a.kind === 'pct') throw new CalcError('Cannot raise a percentage to a power');
  if (isPlain(a)) return plain(a.value.pow(n));
  const p = n.toNumber();
  const display = a.display.map((t) => ({ unit: t.unit, power: Math.round(t.power * p * 1e9) / 1e9 }));
  if (display.some((t) => !Number.isInteger(t.power))) throw new CalcError('Cannot raise this unit to that power');
  return { kind: 'num', value: a.value.pow(n), dims: scaleDims(a.dims, p), display };
}

function mod(a: Value, b: Value): Value {
  if (a.kind !== 'num' || b.kind !== 'num') throw new CalcError('mod expects numbers');
  const terms = a.display.length ? a.display : b.display;
  const y = displayIn(b, terms);
  if (y.isZero()) throw new CalcError('Division by zero');
  return fromDisplay(displayIn(a, terms).mod(y), terms);
}

function compare(a: Value, b: Value): number {
  if (a.kind === 'pct' && b.kind === 'pct') return a.value.comparedTo(b.value);
  if (a.kind === 'num' && b.kind === 'num' && eqDims(a.dims, b.dims)) return a.value.comparedTo(b.value);
  throw new CalcError('Values are not comparable');
}

function convert(v: Value, target: Target): Value {
  if (target.kind === 'pct') {
    if (v.kind === 'pct') return v;
    if (isPlain(v)) return pct(v.value.times(100));
    throw new CalcError('Only numbers without a unit can be converted to %');
  }
  if (v.kind === 'pct') throw new CalcError('Percentages have no unit');
  if (target.kind === 'fmt') return { ...v, fmt: target.fmt === 'dec' ? undefined : target.fmt };
  const dims = termsDims(target.terms);
  if (isPlain(v)) return fromDisplay(v.value, target.terms);
  if (!eqDims(v.dims, dims)) throw new CalcError('Units do not match');
  return { kind: 'num', value: v.value, dims, display: target.terms };
}

// ---------------------------------------------------------------------------
// Functions

const plainArg = (v: Value | undefined, fn: string): Decimal => {
  if (!v || !isPlain(v)) throw new CalcError(`${fn}() expects a number without a unit`);
  return v.value;
};
const first = (args: Value[], fn: string) => {
  if (!args[0]) throw new CalcError(`${fn}() needs an argument`);
  return args[0];
};
const roundFn = (mode: Rounding, fn: string) => (args: Value[]) => {
  const s = D(10).pow(args[1] ? plainArg(args[1], fn) : 0);
  return mapDisplay(first(args, fn), (x) => x.times(s).toDecimalPlaces(0, mode).div(s));
};
const pickFn = (sign: 1 | -1, fn: string) => (args: Value[]) => {
  if (!args.length) throw new CalcError(`${fn}() needs arguments`);
  return args.reduce((a, b) => (sign * compare(a, b) >= 0 ? a : b));
};
const mathFn = (f: (x: Decimal) => Decimal, fn: string) => (args: Value[]) => plain(f(plainArg(args[0], fn)));

const { ROUND_HALF_UP, ROUND_FLOOR, ROUND_CEIL } = Decimal;

export const FUNCTIONS: Record<string, (args: Value[]) => Value> = {
  sqrt: (a) => pow(first(a, 'sqrt'), plain(0.5)),
  wurzel: (a) => pow(first(a, 'wurzel'), plain(0.5)),
  cbrt: (a) => pow(first(a, 'cbrt'), plain(D(1).div(3))),
  abs: (a) => mapDisplay(first(a, 'abs'), (x) => x.abs()),
  round: roundFn(ROUND_HALF_UP, 'round'),
  runden: roundFn(ROUND_HALF_UP, 'runden'),
  floor: roundFn(ROUND_FLOOR, 'floor'),
  abrunden: roundFn(ROUND_FLOOR, 'abrunden'),
  ceil: roundFn(ROUND_CEIL, 'ceil'),
  aufrunden: roundFn(ROUND_CEIL, 'aufrunden'),
  min: pickFn(-1, 'min'),
  max: pickFn(1, 'max'),
  log: (a) => plain(plainArg(a[0], 'log').log(a[1] ? plainArg(a[1], 'log') : 10)),
  ln: mathFn((x) => x.ln(), 'ln'),
  exp: mathFn((x) => x.exp(), 'exp'),
  sin: mathFn((x) => x.sin(), 'sin'),
  cos: mathFn((x) => x.cos(), 'cos'),
  tan: mathFn((x) => x.tan(), 'tan'),
  asin: mathFn((x) => x.asin(), 'asin'),
  acos: mathFn((x) => x.acos(), 'acos'),
  atan: mathFn((x) => x.atan(), 'atan'),
};

// ---------------------------------------------------------------------------

function sumBlock(scope: Scope): Value {
  const nums = scope.block.filter((v): v is NumV => v.kind === 'num');
  return nums.reduce<Value>((acc, v) => addSub(acc, v, 1), plain(0));
}

function resolve(name: string, scope: Scope): Value {
  const v = scope.vars.get(name);
  if (v) return v;
  if (name in CONSTANTS) return plain(CONSTANTS[name]);
  const lower = name.toLowerCase();
  if (PREV_WORDS.includes(lower)) {
    if (!scope.prev) throw new CalcError('No previous result');
    return scope.prev;
  }
  if (SUM_WORDS.includes(lower)) return sumBlock(scope);
  if (AVG_WORDS.includes(lower)) {
    const n = scope.block.filter((v) => v.kind === 'num').length;
    if (!n) throw new CalcError('No values to average');
    return div(sumBlock(scope), plain(n));
  }
  const u = lookupUnit(name);
  if (u) return { ...fromDisplay(D(1), [{ unit: u, power: 1 }]), bare: true };
  throw new CalcError(`Unknown: ${name}`);
}

export function evaluate(node: Node, scope: Scope): Value {
  const ev = (n: Node) => evaluate(n, scope);
  switch (node.t) {
    case 'num':
      return plain(node.v);
    case 'unit': {
      const v = ev(node.e);
      if (!isPlain(v)) throw new CalcError('Value already has a unit');
      return fromDisplay(v.value, node.terms);
    }
    case 'neg':
      return mapDisplay(ev(node.e), (x) => x.neg());
    case 'pct': {
      const v = ev(node.e);
      if (!isPlain(v)) throw new CalcError('% only after numbers without a unit');
      return pct(v.value);
    }
    case 'bin': {
      const l = ev(node.l);
      const r = ev(node.r);
      switch (node.op) {
        case '+': return addSub(l, r, 1);
        case '-': return addSub(l, r, -1);
        case '*': return mul(l, r);
        case '/': return div(l, r);
        case '^': return pow(l, r);
        case 'mod': return mod(l, r);
      }
      break;
    }
    case 'pctop': {
      const l = ev(node.l);
      const r = ev(node.r);
      if (l.kind !== 'pct') throw new CalcError(`"${node.op}" expects a percentage before it`);
      if (r.kind !== 'num') throw new CalcError('Percent of what?');
      const p = l.value.div(100);
      const f = node.op === 'of' ? p : node.op === 'off' ? D(1).minus(p) : p.plus(1);
      return mapDisplay(r, (x) => x.times(f));
    }
    case 'conv':
      return convert(ev(node.e), node.target);
    case 'asPctOf': {
      const a = ev(node.l);
      const b = ev(node.r);
      if (a.kind !== 'num' || b.kind !== 'num' || !eqDims(a.dims, b.dims)) throw new CalcError('Units do not match');
      if (b.value.isZero()) throw new CalcError('Division by zero');
      return pct(a.value.div(b.value).times(100));
    }
    case 'ident':
      return resolve(node.name, scope);
    case 'call': {
      const fn = FUNCTIONS[node.name.toLowerCase()];
      if (!fn) throw new CalcError(`Unknown function: ${node.name}`);
      return fn(node.args.map(ev));
    }
    case 'assign': {
      const v = ev(node.e);
      scope.vars.set(node.name, v);
      return v;
    }
  }
  throw new CalcError('Unknown expression');
}

export function checkFinite(v: Value): Value {
  if (!v.value.isFinite()) throw new CalcError('Result is not finite');
  return v;
}
