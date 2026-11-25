import { describe, expect, it } from 'vitest';
import { D, Decimal } from '../src/num';

describe('num: configured Decimal', () => {
  it('is exact for decimal sums', () => {
    expect(D('0.1').plus('0.2').eq('0.3')).toBe(true);
  });

  it('rounds half up', () => {
    expect(D('1.005').toDecimalPlaces(2).toFixed()).toBe('1.01');
    expect(D('-2.5').toDecimalPlaces(0).toFixed()).toBe('-3');
  });

  it('keeps 40 significant digits', () => {
    expect(D(1).div(3).sd()).toBe(40);
    expect(D(1).div(3).toSignificantDigits(40).toFixed()).toBe(
      '0.3333333333333333333333333333333333333333',
    );
  });

  it('exposes the configured precision and rounding', () => {
    expect(Decimal.precision).toBe(40);
    expect(Decimal.rounding).toBe(Decimal.ROUND_HALF_UP);
  });
});
