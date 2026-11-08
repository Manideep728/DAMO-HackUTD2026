import { expect, test } from '@playwright/test';

// The rehearsal runs without a model (GAUNTLET_MODE=mock). Read with Nemotron must then say so plainly and
// leave the findings as they were, never show a fake read.
test('Read with Nemotron without a model says it is unavailable', async ({ page }) => {
  await page.goto('/#/preflight');
  await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Findings' }).click();
  const finding = page.locator('article', { hasText: 'MCC-B is fed from ATS-1, not ATS-2 as documented' });
  await expect(finding).toBeVisible();
  await page.getByRole('button', { name: 'Read with Nemotron' }).click();
  await expect(page.getByText('Nemotron unavailable and nothing recorded for these records')).toBeVisible();
  await expect(page.getByText(/^Nemotron read \d+ of/)).toHaveCount(0);
  await expect(finding).toContainText('97% confidence');
});
