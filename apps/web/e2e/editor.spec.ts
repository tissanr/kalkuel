import { expect, test } from '@playwright/test';
import { expectLine, openDoc, resultOf } from './helpers';

test('shows results for calculations and none for prose', async ({ page }) => {
  await openDoc(page, '# Budget\n\nDas ist Prosa.\nmiete = 1.250 €\nnebenkosten = 280 €\nmiete + nebenkosten');
  await expect(resultOf(page, 'miete + nebenkosten')).toHaveText('1.530,00 €');
  await expect(page.locator('.cm-line', { hasText: 'Das ist Prosa.' }).locator('.cm-calc-result')).toHaveCount(0);
});

test('recalculates while typing', async ({ page }) => {
  await openDoc(page, 'a = 2\na * 3');
  await expect(resultOf(page, 'a * 3')).toHaveText('6');
  await page.locator('.cm-line', { hasText: 'a = 2' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('0');
  await expect(resultOf(page, 'a * 3')).toHaveText('60');
});

test('converts currencies with the loaded rates', async ({ page }) => {
  await expectLine(page, '10 € in USD', '12,50 $');
});

test('inline expressions show a badge', async ({ page }) => {
  await openDoc(page, 'x = 5\nDas ergibt `= x * 2` Stück.');
  await expect(page.locator('.cm-calc-inline')).toHaveText('10');
});

test('theme toggle switches and persists', async ({ page }) => {
  await openDoc(page, '1 + 1');
  const btn = page.locator('#btn-theme');
  await btn.click();
  await btn.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
