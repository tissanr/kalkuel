import type { Fmt, Node, Target } from './parser';
import {
  dimsKey, eqDims, isDimless, lookupUnit, mulDims, scaleDims, termsDims, termsFactor,
  type Dims, type UnitTerm,
} from './units';

export interface NumV {
  kind: 'num';
  /** Value in base units. */
  value: number;
  dims: Dims;
  /** Units used for display. */
  display: UnitTerm[];
  fmt?: Exclude<Fmt, 'dec'>;
  /** A bare unit like the "h" in "€/h": dividing by it keeps both units (rate). */
  bare?: boolean;
}
export interface PctV {
  kind: 'pct';
  value: number;
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

export const plain = (v: number): NumV => ({ kind: 'num', value: v, dims: {}, display: [] });
const pct = (v: number): PctV => ({ kind: 'pct', value: v });
export const isPlain = (v: Value): boolean => v.kind === 'num' && isDimless(v.dims) && v.display.length === 0;

export const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E, tau: 2 * Math.PI };
export const PREV_WORDS = ['prev', 'ans', 'vorher'];
export const SUM_WORDS = ['sum', 'total', 'summe', 'gesamt'];
export const AVG_WORDS = ['avg', 'average', 'mean', 'schnitt', 'durchschnitt'];
const SPECIAL = new Set([...PREV_WORDS, ...SUM_WORDS, ...AVG_WORDS]);
export const isSpecialWord = (w: string) => SPECIAL.has(w.toLowerCase()) || w in CONSTANTS;

// ---------------------------------------------------------------------------
// Unit-aware helpers

const hasOffset = (terms: UnitTerm[]) => terms.length === 1 && terms[0].power === 1 && terms[0].unit.offset !== undefined;

export function toDisplay(n: NumV, terms: UnitTerm[] = n.display): number {
  if (hasOffset(terms)) return (n.value - terms[0].unit.offset!) / terms[0].unit.factor;
  return n.value / termsFactor(terms);
}

export function fromDisplay(v: number, terms: UnitTerm[]): NumV {
  const dims = termsDims(terms);
  if (hasOffset(terms)) return { kind: 'num', value: v * terms[0].unit.factor + terms[0].unit.offset!, dims, display: terms };
  return { kind: 'num', value: v * termsFactor(terms), dims, display: terms };
}

function mapDisplay(n: Value, f: (x: number) => number): Value {
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
        Math.abs(Math.pow(a.unit.factor, a.power) * Math.pow(b.unit.factor, b.power) - 1) < 1e-9,
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

function displayIn(n: NumV, terms: UnitTerm[]): number {
  if (isPlain(n)) return n.value;
  if (!eqDims(n.dims, termsDims(terms))) throw new CalcError('Units do not match');
  return toDisplay(n, terms);
}

function addSub(a: Value, b: Value, sign: 1 | -1): Value {
  if (a.kind === 'pct' && b.kind === 'pct') return pct(a.value + sign * b.value);
  if (a.kind === 'num' && b.kind === 'pct') return mapDisplay(a, (x) => x * (1 + (sign * b.value) / 100));
  if (a.kind === 'pct' || b.kind === 'pct') throw new CalcError('Cannot combine a percentage and a number like this');
  const terms = a.display.length ? a.display : b.display;
  return { ...fromDisplay(displayIn(a, terms) + sign * displayIn(b, terms), terms), fmt: a.fmt ?? b.fmt };
}

function mul(a: Value, b: Value): Value {
  if (a.kind === 'pct' && b.kind === 'pct') return pct((a.value * b.value) / 100);
  if (a.kind === 'pct') return mul(plain(a.value / 100), b);
  if (b.kind === 'pct') return mul(a, plain(b.value / 100));
  if (isPlain(b)) return mapDisplay(a, (x) => x * b.value);
  if (isPlain(a)) return mapDisplay(b, (x) => x * a.value);
  return { kind: 'num', value: a.value * b.value, dims: mulDims(a.dims, b.dims), display: simplify([...a.display, ...b.display]) };
}

function div(a: Value, b: Value): Value {
  if (b.kind === 'pct') {
    if (a.kind === 'pct') return plain(a.value / b.value);
    return div(a, plain(b.value / 100));
  }
  if (b.value === 0) throw new CalcError('Division by zero');
  if (isPlain(b)) return mapDisplay(a, (x) => x / b.value);
  if (a.kind === 'pct') throw new CalcError('Invalid percentage calculation');
  return {
    kind: 'num',
    value: a.value / b.value,
    dims: mulDims(a.dims, b.dims, -1),
    display: simplify([...a.display, ...b.display.map((t) => ({ unit: t.unit, power: -t.power }))], !b.bare),
  };
}

function pow(a: Value, b: Value): Value {
  if (!isPlain(b)) throw new CalcError('Exponent must be a number without a unit');
  const n = b.value;
  if (a.kind === 'pct') throw new CalcError('Cannot raise a percentage to a power');
  if (isPlain(a)) return plain(Math.pow(a.value, n));
  const display = a.display.map((t) => ({ unit: t.unit, power: Math.round(t.power * n * 1e9) / 1e9 }));
  if (display.some((t) => !Number.isInteger(t.power))) throw new CalcError('Cannot raise this unit to that power');
  return { kind: 'num', value: Math.pow(a.value, n), dims: scaleDims(a.dims, n), display };
}

function mod(a: Value, b: Value): Value {
  if (a.kind !== 'num' || b.kind !== 'num') throw new CalcError('mod expects numbers');
  const terms = a.display.length ? a.display : b.display;
  const y = displayIn(b, terms);
  if (y === 0) throw new CalcError('Division by zero');
  return fromDisplay(displayIn(a, terms) % y, terms);
}

function compare(a: Value, b: Value): number {
  if (a.kind === 'pct' && b.kind === 'pct') return a.value - b.value;
  if (a.kind === 'num' && b.kind === 'num' && eqDims(a.dims, b.dims)) return a.value - b.value;
  throw new CalcError('Values are not comparable');
}

function convert(v: Value, target: Target): Value {
  if (target.kind === 'pct') {
    if (v.kind === 'pct') return v;
    if (isPlain(v)) return pct(v.value * 100);
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

const plainArg = (v: Value | undefined, fn: string) => {
  if (!v || !isPlain(v)) throw new CalcError(`${fn}() expects a number without a unit`);
  return v.value;
};
const first = (args: Value[], fn: string) => {
  if (!args[0]) throw new CalcError(`${fn}() needs an argument`);
  return args[0];
};
const roundFn = (f: (x: number) => number, fn: string) => (args: Value[]) => {
  const digits = args[1] ? plainArg(args[1], fn) : 0;
  const s = 10 ** digits;
  return mapDisplay(first(args, fn), (x) => f(x * s) / s);
};
const pickFn = (sign: 1 | -1, fn: string) => (args: Value[]) => {
  if (!args.length) throw new CalcError(`${fn}() needs arguments`);
  return args.reduce((a, b) => (sign * compare(a, b) >= 0 ? a : b));
};
const mathFn = (f: (x: number) => number, fn: string) => (args: Value[]) => plain(f(plainArg(args[0], fn)));

export const FUNCTIONS: Record<string, (args: Value[]) => Value> = {
  sqrt: (a) => pow(first(a, 'sqrt'), plain(0.5)),
  wurzel: (a) => pow(first(a, 'wurzel'), plain(0.5)),
  cbrt: (a) => pow(first(a, 'cbrt'), plain(1 / 3)),
  abs: (a) => mapDisplay(first(a, 'abs'), Math.abs),
  round: roundFn(Math.round, 'round'),
  runden: roundFn(Math.round, 'runden'),
  floor: roundFn(Math.floor, 'floor'),
  abrunden: roundFn(Math.floor, 'abrunden'),
  ceil: roundFn(Math.ceil, 'ceil'),
  aufrunden: roundFn(Math.ceil, 'aufrunden'),
  min: pickFn(-1, 'min'),
  max: pickFn(1, 'max'),
  log: (a) => plain(a[1] ? Math.log(plainArg(a[0], 'log')) / Math.log(plainArg(a[1], 'log')) : Math.log10(plainArg(a[0], 'log'))),
  ln: mathFn(Math.log, 'ln'),
  exp: mathFn(Math.exp, 'exp'),
  sin: mathFn(Math.sin, 'sin'),
  cos: mathFn(Math.cos, 'cos'),
  tan: mathFn(Math.tan, 'tan'),
  asin: mathFn(Math.asin, 'asin'),
  acos: mathFn(Math.acos, 'acos'),
  atan: mathFn(Math.atan, 'atan'),
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
  if (u) return { ...fromDisplay(1, [{ unit: u, power: 1 }]), bare: true };
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
      return mapDisplay(ev(node.e), (x) => -x);
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
      const p = l.value / 100;
      const f = node.op === 'of' ? p : node.op === 'off' ? 1 - p : 1 + p;
      return mapDisplay(r, (x) => x * f);
    }
    case 'conv':
      return convert(ev(node.e), node.target);
    case 'asPctOf': {
      const a = ev(node.l);
      const b = ev(node.r);
      if (a.kind !== 'num' || b.kind !== 'num' || !eqDims(a.dims, b.dims)) throw new CalcError('Units do not match');
      if (b.value === 0) throw new CalcError('Division by zero');
      return pct((a.value / b.value) * 100);
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
  if (!Number.isFinite(v.value)) throw new CalcError('Result is not finite');
  return v;
}
