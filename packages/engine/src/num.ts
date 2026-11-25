import DecimalJs from 'decimal.js';

/** The one Decimal used everywhere: 40 significant digits, rounding as on a German invoice. */
export const Decimal = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_UP,
});
export type Decimal = DecimalJs;

/** Shorthand for `new Decimal(x)`. */
export const D = (x: DecimalJs.Value): Decimal => new Decimal(x);
