import { expect, type Page } from '@playwright/test';

/** Fixed exchange rates, so results never depend on the day the test runs. */
export const RATES = { USD: 1.25, GBP: 0.8, CHF: 0.95 };

/** Opens Kalkül with `doc` as the document, offline-safe and deterministic. */
export async function openDoc(page: Page, doc: string) {
  await page.route('https://api.frankfurter.dev/**', (r) =>
    r.fulfill({ json: { date: '2026-01-02', rates: RATES } }),
  );
  await page.addInitScript((d) => {
    if (sessionStorage.getItem('e2e:seeded')) return; // keep state across reloads
    sessionStorage.setItem('e2e:seeded', '1');
    localStorage.clear();
    localStorage.setItem('kalkuel:doc', d);
  }, doc);
  await page.goto('/');
  await expect(page.locator('#status-rates')).toContainText('2026-01-02');
}

/** Result shown in the result column for the line whose source is exactly `src`. */
export function resultOf(page: Page, src: string) {
  return page.locator('.cm-line', { hasText: src }).first().locator('.cm-calc-result');
}

/** Opens a document with one line and expects its result. */
export async function expectLine(page: Page, src: string, result: string) {
  await openDoc(page, src);
  await expect(resultOf(page, src)).toHaveText(result);
}
