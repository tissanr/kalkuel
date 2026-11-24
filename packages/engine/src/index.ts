export { evaluateDocument } from './document';
export type { DocResult, DocOptions, LineResult, InlineResult, Span, SpanType, VarInfo } from './document';
export { formatValue, formatNumber, formatUnits } from './format';
export { FUNCTIONS, CONSTANTS, PREV_WORDS, SUM_WORDS, AVG_WORDS } from './evaluate';
export type { Value, NumV, PctV } from './evaluate';
export { KEYWORDS, FMT_WORDS } from './parser';
export type { Locale } from './lexer';
export { setRates, currencyCodes, lookupUnit, unitNames, FALLBACK_RATES } from './units';
