import { expect, test } from '@playwright/test';

// The Why panel asks Nemotron about each scenario. With a key that spends API calls, so clicking through
// scenarios quickly must start one run for the scenario you stop on, not one per click.
test('the automatic agent check runs once for the scenario you settle on', async ({ page }) => {
  const asks: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/preflight/agent')) asks.push(r.postData() ?? ''); });
  await page.goto('/#/preflight');
  await expect(page.getByText('Preflight · Demo hall H1')).toBeVisible();
  await page.getByRole('button', { name: 'Chiller CH-1 maintenance' }).click();
  await page.getByRole('button', { name: 'UPS-A maintenance' }).click();
  await page.getByRole('button', { name: 'ATS-1 fails' }).click();
  await expect.poll(() => asks.length, { timeout: 5_000 }).toBe(1);
  await page.waitForTimeout(1_500); // nothing else fires afterwards
  expect(asks).toHaveLength(1);
  expect(asks[0]).toContain('ATS-1 fails');
});
