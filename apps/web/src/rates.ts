import { setRates } from '@kalkuel/engine';

const KEY = 'kalkuel:rates';
const today = () => new Date().toISOString().slice(0, 10);

interface Cached {
  rates: Record<string, number>;
  date: string;
  fetchedAt: string;
}

export type RatesStatus = { source: 'live' | 'cache' | 'fallback'; date?: string };

function readCache(): Cached | undefined {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? undefined;
  } catch {
    return undefined;
  }
}

/** Loads ECB exchange rates (via frankfurter.dev), cached once per day. */
export async function loadRates(): Promise<RatesStatus> {
  const cached = readCache();
  if (cached && cached.fetchedAt === today()) {
    setRates(cached.rates);
    return { source: 'cache', date: cached.date };
  }
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR');
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { date: string; rates: Record<string, number> };
    setRates(json.rates);
    try {
      localStorage.setItem(KEY, JSON.stringify({ rates: json.rates, date: json.date, fetchedAt: today() }));
    } catch {
      /* storage unavailable */
    }
    return { source: 'live', date: json.date };
  } catch {
    if (cached) {
      setRates(cached.rates);
      return { source: 'cache', date: cached.date };
    }
    return { source: 'fallback' };
  }
}
