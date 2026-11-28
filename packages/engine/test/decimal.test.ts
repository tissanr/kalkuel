import { describe, expect, it } from 'vitest';
import { evaluateDocument, setRates } from '../src/index';

/**
 * Acceptance tests for exact decimal arithmetic (ROADMAP.md).
 *
 * Each case is document text in → displayed result out, exactly what the user sees.
 * `bug: 'D3'` marks a case that fails today and names the roadmap step that fixes it.
 * The step is done when the case passes; then delete its `bug` field.
 * (`it.fails` turns red as soon as a known bug starts working, so nothing goes unnoticed.)
 */
const last = (src: string) => {
  const r = evaluateDocument(src, { locale: 'de' });
  const l = r.lines[src.split('\n').length - 1];
  return l?.text ?? (l?.error ? `ERR: ${l.error}` : undefined);
};

type Case = { src: string; out: string; bug?: string };

const run = (cases: Case[]) => {
  for (const { src, out, bug } of cases) {
    const name = `${src.replaceAll('\n', ' ⏎ ')} → ${out}${bug ? `  [${bug}]` : ''}`;
    (bug ? it.fails : it)(name, () => expect(last(src)).toBe(out));
  }
};

describe('D2 core: + − × ÷ mod and rounding are exact', () => {
  run([
    { src: '0,1 + 0,2', out: '0,3' },
    { src: '0,1 + 0,2 - 0,3', out: '0' },
    { src: '1,1 + 2,2 - 3,3', out: '0' },
    { src: '0,3 mod 0,1', out: '0' },
    { src: '19,99 € * 3', out: '59,97 €' },
    { src: '10 € / 3 * 3', out: '10,00 €' },
    { src: '100 € + 19 %', out: '119,00 €' },
    { src: 'round(1,005; 2)', out: '1,01' },
    { src: 'round(2,675; 2)', out: '2,68' },
    { src: 'round(-2,5)', out: '-3' },
    { src: 'floor(0,7 + 0,1; 1)', out: '0,8' },
    { src: 'ceil(1,1 * 3; 1)', out: '3,3' },
  ]);
});

describe('D3 display: no digits lost', () => {
  run([
    { src: '12.345.678.901,23 €', out: '12.345.678.901,23 €' },
    { src: '1.000.000.000.000,01 €', out: '1.000.000.000.000,01 €' },
    { src: '123.456.789.012.345 + 1', out: '123.456.789.012.346' },
    { src: '9.007.199.254.740.993', out: '9.007.199.254.740.993' },
    { src: 'sin(pi)', out: '0' },
    { src: '1,005 €', out: '1,01 €' },
    { src: '2 / 3', out: '0,666667' },
    { src: '10 / 3', out: '3,3333' },
    { src: '255 in hex', out: '0xFF' },
  ]);
});

describe('D4 currencies: conversion round-trips', () => {
  it('converts and converts back', () => {
    setRates({ USD: 1.0853 });
    expect(last('1 USD in EUR in USD')).toBe('1,00 $');
    expect(last('1.000.000 € in USD')).toBe('1.085.300,00 $');
  });
});

describe('regression: units and functions keep working', () => {
  run([
    { src: '1 mile in km', out: '1,6093 km' },
    { src: '100 °F in °C', out: '37,7778 °C' },
    { src: 'sqrt(2) ^ 2', out: '2' },
    { src: '(4 m) ^ 2', out: '16 m²' },
    { src: '100 km / 2 h in m/s', out: '13,8889 m/s' },
  ]);
});

describe('D6 performance: exact math stays fast', () => {
  it('evaluates a 1,000-line document in under 100 ms', () => {
    const doc = Array.from({ length: 1000 }, (_, i) => `x${i} = ${i},5 € * 1,19 + 3 %`).join('\n');
    evaluateDocument(doc); // warm-up
    const t = performance.now();
    evaluateDocument(doc);
    expect(performance.now() - t).toBeLessThan(100);
  });
});
