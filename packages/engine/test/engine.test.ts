import { describe, expect, it } from 'vitest';
import { evaluateDocument, setRates } from '../src/index';

/** Result text of the last line of `src`. */
const last = (src: string, locale: 'de' | 'en' = 'de') => {
  const r = evaluateDocument(src, { locale });
  const l = r.lines[src.split('\n').length - 1];
  return l?.text ?? (l?.error ? `ERR: ${l.error}` : undefined);
};

describe('arithmetic', () => {
  it.each([
    ['1 + 2', '3'],
    ['(3 + 4) * 2^3', '56'],
    ['2(3 + 4)', '14'],
    ['17 mod 5', '2'],
    ['10 / 4', '2,5'],
    ['-3 + 1', '-2'],
    ['1.250 + 1', '1.251'],
    ['1,5 * 2', '3'],
    ['1.5 * 2', '3'],
    ['5k + 1', '5.001'],
    ['2 Mio / 4', '500.000'],
    ['sqrt(16)', '4'],
    ['round(3,14159; 2)', '3,14'],
    ['max(3, 7)', '7'],
    ['255 in hex', '0xFF'],
    ['0b101 + 1', '6'],
  ])('%s → %s', (src, out) => expect(last(src)).toBe(out));
});

describe('percent', () => {
  it.each([
    ['20 % of 150', '30'],
    ['20 % von 350 €', '70,00 €'],
    ['150 € + 19 %', '178,50 €'],
    ['5 % off 80 €', '76,00 €'],
    ['50 as % of 200', '25 %'],
    ['50 als % von 200', '25 %'],
    ['0,25 in %', '25 %'],
  ])('%s → %s', (src, out) => expect(last(src)).toBe(out));
});

describe('units', () => {
  it.each([
    ['5 km in m', '5.000 m'],
    ['1 mile in km', '1,6093 km'],
    ['5 km in Meilen', '3,1069 mi'],
    ['100 °F in °C', '37,7778 °C'],
    ['20 °C + 5', '25 °C'],
    ['1 GB in MB', '1.000 MB'],
    ['1 km + 500 m', '1,5 km'],
    ['3 h 20 min in min', '200 min'],
    ['100 km / 2 h', '50 km/h'],
    ['100 km / 2 h in m/s', '13,8889 m/s'],
    ['4,2 m * 5,8 m', '24,36 m²'],
    ['1,5 l in ml', '1.500 ml'],
    ['2 GB / 30 s in Mbit/s', '533,3333 Mbit/s'],
    ['95 €/h * 40 h', '3.800,00 €'],
    ['32 h/Woche * 6 Wochen', '192 h'],
    ['4 m * 5 m * 38 €/m²', '760,00 €'],
    ['20 m² / 4 m', '5 m'],
    ['5 kg + 3 km', 'ERR: Units do not match'],
  ])('%s → %s', (src, out) => expect(last(src)).toBe(out));
});

describe('currencies', () => {
  it('converts with given rates', () => {
    setRates({ USD: 2 });
    expect(last('10 € in USD')).toBe('20,00 $');
    expect(last('$100 in EUR')).toBe('50,00 €');
    expect(last('10 € + 10 $')).toBe('15,00 €');
  });
});

describe('document', () => {
  it('variables', () => {
    expect(last('rent = 1.250 €\nutilities = 280 €\nrent + utilities')).toBe('1.530,00 €');
  });
  it('prev, sum, avg and blocks', () => {
    expect(last('10\nprev * 2')).toBe('20');
    expect(last('Hotel: 300 €\nFlight: 450 €\nsum')).toBe('750,00 €');
    expect(last('10\n\n5\nsum')).toBe('5');
    expect(last('2\n4\navg')).toBe('3');
    expect(last('## A\n10\n## B\n5\nsum')).toBe('5');
  });
  it('labels, lists and quotes', () => {
    expect(last('- Hotel: 3 * 89 €')).toBe('267,00 €');
    expect(last('- **Total:** 2 * 3')).toBe('6');
    expect(last('1. 2 + 2')).toBe('4');
    expect(last('- [ ] 7 * 6')).toBe('42');
    expect(last('> 1 + 1')).toBe('2');
  });
  it('ignores prose', () => {
    expect(last('This is a sentence.')).toBeUndefined();
    expect(last('Meeting 3 - 4 pm')).toBeUndefined();
    // German prose is ignored too
    expect(last('Das ist ein Satz.')).toBeUndefined();
    expect(last('Termin 3 - 4 Uhr')).toBeUndefined();
    expect(last('1. Einkauf')).toBeUndefined();
    expect(last('Wir treffen uns um 10:30')).toBeUndefined();
    expect(last('Stunden')).toBeUndefined();
    expect(last('Termin 3 - 4 Uhr')).toBeUndefined();
    expect(last('24.12.2025')).toBeUndefined();
    expect(last('Stunden')).toBeUndefined();
    expect(last('1. Groceries')).toBeUndefined();
    expect(last('# 2 + 2')).toBeUndefined();
    expect(last('We meet at 10:30')).toBeUndefined();
  });
  it('comments', () => {
    expect(last('2 * 3 // six')).toBe('6');
  });
  it('fenced code', () => {
    expect(last('```js\n1 + 1')).toBeUndefined();
    expect(last('```calc\nfoo + 1')).toBe('ERR: Unknown: foo');
    expect(last('```calc\na = 2\na * 3')).toBe('6');
  });
  it('inline expressions', () => {
    const r = evaluateDocument('x = 5\nThat makes `= x * 2` pieces and `= nope`.');
    expect(r.lines[1]?.inline.map((i) => i.text ?? i.error)).toEqual(['10', 'Unknown: nope']);
  });
  it('variable info and spans', () => {
    const r = evaluateDocument('rate = 95 €/h');
    expect(r.vars.get('rate')).toEqual({ line: 0, text: '95 €/h' });
    expect(r.lines[0]?.spans.map((s) => s.type)).toEqual(['variable', 'operator', 'number', 'unit', 'operator', 'unit']);
  });
  it('defaults to English number format', () => {
    expect(evaluateDocument('1,250.5 + 1').lines[0]?.text).toBe('1,251.5');
    expect(evaluateDocument('100 € * 2').lines[0]?.text).toBe('€200.00');
    expect(evaluateDocument('---\nlocale: de\n---\n1.250,5 + 1').lines[3]?.text).toBe('1.251,5');
  });
  it('locale from frontmatter', () => {
    expect(last('---\nlocale: en-US\n---\n1,250.5 + 1')).toBe('1,251.5');
    expect(last('1,250.50 + 1', 'en')).toBe('1,251.5');
    expect(last('100 € * 2', 'en')).toBe('€200.00');
  });
});
