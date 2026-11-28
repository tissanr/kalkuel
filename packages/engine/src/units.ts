import { D, type Decimal, type DecimalValue } from './num';

/** Dimension vector, e.g. { L: 1, T: -1 } for a speed. */
export type Dims = Readonly<Record<string, number>>;

export interface UnitDef {
  /** Symbol used for display. */
  symbol: string;
  /** How many base units one of this unit is. */
  factor: Decimal;
  /** Additive offset to the base unit (temperatures only). */
  offset?: Decimal;
  dims: Dims;
  /** ISO code when this unit is a currency. */
  currency?: string;
  /** Fixed number of fraction digits when displayed on its own. */
  decimals?: number;
  /** Power of a simpler unit this unit equals, e.g. m² = m^2. */
  expand?: UnitTerm;
}

export interface UnitTerm {
  unit: UnitDef;
  power: number;
}

const byName = new Map<string, UnitDef>();
const byLower = new Map<string, UnitDef>();
/** Words that must never be read as a unit symbol. */
const RESERVED = new Set(['in', 'to', 'as', 'of', 'on']);

function register(names: string[], u: UnitDef) {
  for (const n of names) {
    if (RESERVED.has(n)) continue;
    if (!byName.has(n)) byName.set(n, u);
    if (n.length >= 3) {
      const l = n.toLowerCase();
      if (!byLower.has(l)) byLower.set(l, u);
    }
  }
}

function unit(symbol: string, factor: DecimalValue, dims: Dims, aliases: string[] = [], extra: Partial<UnitDef> = {}): UnitDef {
  const u: UnitDef = { symbol, factor: D(factor), dims, ...extra };
  register([symbol, ...aliases], u);
  return u;
}

export function lookupUnit(name: string): UnitDef | undefined {
  return byName.get(name) ?? (name.length >= 3 ? byLower.get(name.toLowerCase()) : undefined);
}

export function unitNames(): string[] {
  return [...byName.keys()];
}

// ---------------------------------------------------------------------------
// Unit table. Base units: m, kg, s, byte, EUR, K.

const L = { L: 1 }, M = { M: 1 }, T = { T: 1 }, B = { D: 1 }, K = { K: 1 };

// Length
unit('mm', 0.001, L, ['millimeter', 'millimeters', 'Millimeter']);
const cm = unit('cm', 0.01, L, ['centimeter', 'centimeters', 'Zentimeter']);
unit('dm', 0.1, L, ['decimeter', 'Dezimeter']);
const m = unit('m', 1, L, ['meter', 'meters', 'metre', 'metres', 'Meter']);
const km = unit('km', 1000, L, ['kilometer', 'kilometers', 'kilometre', 'Kilometer']);
unit('in', 0.0254, L, ['inch', 'inches', 'Zoll', '″']);
const ft = unit('ft', 0.3048, L, ['foot', 'feet', 'Fuß']);
unit('yd', 0.9144, L, ['yard', 'yards']);
unit('mi', 1609.344, L, ['mile', 'miles', 'Meile', 'Meilen']);
unit('nmi', 1852, L, ['Seemeile', 'Seemeilen']);

// Mass
unit('mg', 1e-6, M, ['milligram', 'Milligramm']);
unit('g', 0.001, M, ['gram', 'grams', 'gramm', 'Gramm']);
unit('kg', 1, M, ['kilogram', 'kilograms', 'Kilogramm', 'kilo', 'kilos', 'Kilo']);
unit('t', 1000, M, ['tonne', 'tonnes', 'ton', 'tons', 'Tonne', 'Tonnen']);
unit('lb', 0.45359237, M, ['lbs', 'pound', 'pounds']);
unit('oz', 0.028349523125, M, ['ounce', 'ounces', 'Unze', 'Unzen']);

// Time
unit('ms', 0.001, T, ['millisecond', 'milliseconds', 'Millisekunde', 'Millisekunden']);
unit('s', 1, T, ['sec', 'secs', 'second', 'seconds', 'sek', 'Sekunde', 'Sekunden']);
unit('min', 60, T, ['mins', 'minute', 'minutes', 'Minute', 'Minuten']);
unit('h', 3600, T, ['hr', 'hrs', 'hour', 'hours', 'Std', 'std', 'Stunde', 'Stunden']);
unit('d', 86400, T, ['day', 'days', 'Tag', 'Tage', 'Tagen']);
unit('wk', 604800, T, ['week', 'weeks', 'Woche', 'Wochen']);
unit('mo', 2629800, T, ['month', 'months', 'Monat', 'Monate', 'Monaten']);
unit('yr', 31557600, T, ['year', 'years', 'Jahr', 'Jahre', 'Jahren']);

// Data (decimal and binary prefixes)
unit('bit', 0.125, B, ['bits']);
unit('B', 1, B, ['byte', 'bytes', 'Byte']);
unit('kB', 1e3, B, ['KB']);
unit('MB', 1e6, B);
unit('GB', 1e9, B);
unit('TB', 1e12, B);
unit('PB', 1e15, B);
unit('KiB', 1024, B);
unit('MiB', 1024 ** 2, B);
unit('GiB', 1024 ** 3, B);
unit('TiB', 1024 ** 4, B);
unit('kbit', 125, B, ['Kbit']);
unit('Mbit', 125e3, B);
unit('Gbit', 125e6, B);

// Area
const A = { L: 2 };
unit('m²', 1, A, ['m2', 'qm', 'sqm'], { expand: { unit: m, power: 2 } });
unit('cm²', 1e-4, A, ['cm2'], { expand: { unit: cm, power: 2 } });
unit('km²', 1e6, A, ['km2'], { expand: { unit: km, power: 2 } });
unit('ha', 1e4, A, ['hectare', 'hectares', 'Hektar']);
unit('acre', 4046.8564224, A, ['acres']);
unit('ft²', 0.09290304, A, ['ft2', 'sqft'], { expand: { unit: ft, power: 2 } });

// Volume
const V = { L: 3 };
unit('ml', 1e-6, V, ['mL', 'milliliter', 'Milliliter']);
unit('cl', 1e-5, V);
unit('dl', 1e-4, V);
unit('l', 1e-3, V, ['L', 'liter', 'liters', 'litre', 'litres', 'Liter']);
unit('m³', 1, V, ['m3', 'cbm'], { expand: { unit: m, power: 3 } });
unit('cm³', 1e-6, V, ['cm3', 'ccm'], { expand: { unit: cm, power: 3 } });
unit('gal', 0.003785411784, V, ['gallon', 'gallons', 'Gallone', 'Gallonen']);

// Speed
const S = { L: 1, T: -1 };
unit('km/h', D(1).div('3.6'), S, ['kmh', 'kph']);
unit('mph', '0.44704', S);
unit('kn', D(1852).div(3600), S, ['knot', 'knots', 'Knoten']);

// Temperature
unit('K', 1, K, ['kelvin', 'Kelvin']);
unit('°C', 1, K, ['celsius', 'Celsius', 'degC'], { offset: D('273.15') });
unit('°F', D(5).div(9), K, ['fahrenheit', 'Fahrenheit', 'degF'], { offset: D('273.15').minus(D(32 * 5).div(9)) });

// Energy & power
const E = { M: 1, L: 2, T: -2 };
const P = { M: 1, L: 2, T: -3 };
unit('J', 1, E, ['joule', 'joules', 'Joule']);
unit('kJ', 1e3, E);
unit('cal', 4.184, E, ['calorie', 'calories', 'Kalorie', 'Kalorien']);
unit('kcal', 4184, E);
unit('Wh', 3600, E);
unit('kWh', 3.6e6, E);
unit('MWh', 3.6e9, E);
unit('W', 1, P, ['watt', 'watts', 'Watt']);
unit('kW', 1e3, P);
unit('MW', 1e6, P);
unit('PS', 735.49875, P);
unit('hp', 745.69987, P, ['horsepower']);

// ---------------------------------------------------------------------------
// Currencies. Base is EUR; `factor` = EUR per 1 unit of the currency.

const CURRENCY_INFO: Record<string, { symbol?: string; names?: string[]; decimals?: number }> = {
  EUR: { symbol: '€', names: ['euro', 'euros', 'Euro', 'Euros'] },
  USD: { symbol: '$', names: ['dollar', 'dollars', 'Dollar'] },
  GBP: { symbol: '£' },
  JPY: { symbol: '¥', names: ['yen', 'Yen'], decimals: 0 },
  CHF: { names: ['Franken'] },
  KRW: { decimals: 0 },
  HUF: { decimals: 0 },
  ISK: { decimals: 0 },
  IDR: { decimals: 0 },
};

/** Approximate rates (units per 1 EUR) used until live rates are loaded. */
export const FALLBACK_RATES: Record<string, number> = {
  USD: 1.16, GBP: 0.87, CHF: 0.93, JPY: 178, CAD: 1.62, AUD: 1.78, NZD: 2.0, SEK: 11.0,
  NOK: 11.7, DKK: 7.46, PLN: 4.24, CZK: 24.3, HUF: 385, RON: 5.08, ISK: 145, TRY: 48,
  CNY: 8.25, HKD: 9.0, SGD: 1.5, INR: 102, KRW: 1650, THB: 37.5, IDR: 19000, MYR: 4.9,
  PHP: 67, ILS: 3.9, BRL: 6.2, MXN: 21.4, ZAR: 20.2,
};

const currencies = new Map<string, UnitDef>();

function currency(code: string, perEur: Decimal) {
  const existing = currencies.get(code);
  if (existing) {
    existing.factor = D(1).div(perEur);
    return;
  }
  const info = CURRENCY_INFO[code] ?? {};
  const u: UnitDef = {
    symbol: info.symbol ?? code,
    factor: D(1).div(perEur),
    dims: { C: 1 },
    currency: code,
    decimals: info.decimals ?? 2,
  };
  currencies.set(code, u);
  register([code, ...(info.symbol ? [info.symbol] : []), ...(info.names ?? [])], u);
}

currency('EUR', D(1));
for (const [code, rate] of Object.entries(FALLBACK_RATES)) currency(code, D(String(rate)));

/**
 * Update exchange rates. `rates` maps ISO code → units per 1 EUR.
 * Each rate goes through its string form, so `1.0853` stays exactly `1.0853`.
 */
export function setRates(rates: Record<string, DecimalValue>) {
  for (const [code, rate] of Object.entries(rates)) {
    const r = D(String(rate));
    if (code !== 'EUR' && /^[A-Z]{3}$/.test(code) && r.gt(0)) currency(code, r);
  }
}

export function currencyCodes(): string[] {
  return [...currencies.keys()];
}

// ---------------------------------------------------------------------------
// Dimension helpers

export function mulDims(a: Dims, b: Dims, sign = 1): Dims {
  const r: Record<string, number> = { ...a };
  for (const k in b) {
    const v = (r[k] ?? 0) + sign * b[k];
    if (Math.abs(v) < 1e-12) delete r[k];
    else r[k] = v;
  }
  return r;
}

export function scaleDims(a: Dims, n: number): Dims {
  const r: Record<string, number> = {};
  for (const k in a) r[k] = a[k] * n;
  return r;
}

export function eqDims(a: Dims, b: Dims): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Math.abs(a[k] - (b[k] ?? NaN)) < 1e-12);
}

export const isDimless = (d: Dims) => Object.keys(d).length === 0;

export const dimsKey = (d: Dims) =>
  Object.keys(d)
    .sort()
    .map((k) => k + d[k])
    .join(',');

export function termsDims(terms: UnitTerm[]): Dims {
  let d: Dims = {};
  for (const t of terms) d = mulDims(d, scaleDims(t.unit.dims, t.power));
  return d;
}

export function termsFactor(terms: UnitTerm[]): Decimal {
  return terms.reduce((f, t) => f.times(t.unit.factor.pow(t.power)), D(1));
}
