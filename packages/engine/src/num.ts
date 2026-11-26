import DecimalJs from 'decimal.js';

/** The one Decimal used everywhere: 40 significant digits, rounding as on a German invoice. */
export const Decimal = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_UP,
});
export type Decimal = DecimalJs;
export type DecimalValue = DecimalJs.Value;
export type Rounding = DecimalJs.Rounding;

/** Shorthand for `new Decimal(x)`. */
export const D = (x: DecimalValue): Decimal => new Decimal(x);
