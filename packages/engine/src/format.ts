import { toDisplay, type Value } from './evaluate';
import { D, type Decimal } from './num';
import type { Locale } from './lexer';
import type { UnitTerm } from './units';

const SUP: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '.': '˙',
};
const sup = (n: number) => String(n).split('').map((c) => SUP[c] ?? c).join('');

export function formatUnits(terms: UnitTerm[]): string {
  const part = (t: UnitTerm, p: number) => t.unit.symbol + (p === 1 ? '' : sup(p));
  const num = terms.filter((t) => t.power > 0);
  const den = terms.filter((t) => t.power < 0);
  if (!den.length) return num.map((t) => part(t, t.power)).join('·');
  if (!num.length) return den.map((t) => part(t, t.power)).join('·');
  return `${num.map((t) => part(t, t.power)).join('·')}/${den.map((t) => part(t, -t.power)).join('·')}`;
}

const tag = (locale: Locale) => (locale === 'de' ? 'de-DE' : 'en-US');

export function formatNumber(x: Decimal, locale: Locale, decimals?: number): string {
  const d = x.abs().lt('1e-30') ? D(0) : x;
  const abs = d.abs();
  if (!abs.isZero() && (abs.gte('1e30') || abs.lt('1e-6'))) {
    const [m, e] = d.toExponential(6).split('e');
    return `${Number(m).toLocaleString(tag(locale), { maximumFractionDigits: 6 })}e${e.replace('+', '')}`;
  }
  const places = decimals ?? (abs.lt(1) ? 6 : 4);
  const r = d.toDecimalPlaces(places);
  return new Intl.NumberFormat(tag(locale), {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: places,
  }).format((r.isZero() ? D(0) : r).toFixed() as unknown as number);
}

export function formatValue(v: Value, locale: Locale): string {
  if (v.kind === 'pct') {
    const p = formatNumber(v.value, locale);
    return locale === 'de' ? `${p} %` : `${p}%`;
  }
  const d = toDisplay(v);
  const unit = v.display.length ? ' ' + formatUnits(v.display) : '';
  if (v.fmt === 'hex' || v.fmt === 'bin' || v.fmt === 'oct') {
    const n = BigInt(d.toDecimalPlaces(0).toFixed());
    const radix = { hex: 16, bin: 2, oct: 8 }[v.fmt];
    const prefix = { hex: '0x', bin: '0b', oct: '0o' }[v.fmt];
    return `${n < 0n ? '-' : ''}${prefix}${(n < 0n ? -n : n).toString(radix).toUpperCase()}${unit}`;
  }
  if (v.fmt === 'sci') {
    const [m, e] = d.toExponential(6).split('e');
    return `${Number(m).toLocaleString(tag(locale), { maximumFractionDigits: 6 })}e${e.replace('+', '')}${unit}`;
  }
  const single = v.display.length === 1 && v.display[0].power === 1 ? v.display[0].unit : undefined;
  if (single?.currency) {
    const s = formatNumber(d, locale, single.decimals);
    if (locale === 'en' && single.symbol.length === 1) return s.startsWith('-') ? `-${single.symbol}${s.slice(1)}` : `${single.symbol}${s}`;
    return `${s} ${single.symbol}`;
  }
  return formatNumber(d, locale) + unit;
}
