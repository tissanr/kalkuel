import { test } from '@playwright/test';
import { expectLine } from './helpers';

/**
 * Exact decimal arithmetic, checked in the browser (ROADMAP.md).
 * The third field names the roadmap step that fixes a known bug; delete it when that step is done.
 */
const cases: [src: string, result: string, bug?: string][] = [
  ['0.1 + 0.2 - 0.3', '0'],
  ['round(1.005, 2)', '1.01'],
  ['12,345,678,901.23 €', '€12,345,678,901.23', 'D3'],
  ['19.99 € * 3', '€59.97'],
];

for (const [src, result, bug] of cases) {
  test(`${src} → ${result}${bug ? `  [${bug}]` : ''}`, async ({ page }) => {
    test.fail(!!bug, `known float bug, fixed by ${bug} (ROADMAP.md)`);
    await expectLine(page, src, result);
  });
}
