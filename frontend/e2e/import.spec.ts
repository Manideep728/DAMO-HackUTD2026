import path from 'node:path';
import { expect, test } from '@playwright/test';

// Import a 157-node generated site: it opens on one hall plus what feeds it, Whole site still works, and
// Restore demo puts the demo hall back for the specs that follow.
test('a large imported site opens on one hall with its feeders', async ({ page }) => {
  await page.goto('/#/preflight');
  await expect(page.getByText('Preflight · Demo hall H1')).toBeVisible();
  await expect(page.getByTestId('zone-hint')).toHaveCount(0); // the 43-node demo shows the whole site

  await page.locator('input[type=file]').setInputFiles(path.join(import.meta.dirname, 'fixtures', 'generated-site.csv'));
  await expect(page.getByText('Loaded Imported facility: 157 nodes.')).toBeVisible();
  await expect(page.getByLabel('Zoom to zone')).toHaveValue('H1');

  const hint = page.getByTestId('zone-hint');
  await expect(hint).toContainText('Showing zone H1 and what feeds it');
  const shown = Number((await hint.innerText()).match(/\((\d+) of 157 nodes\)/)![1]);
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(shown);
  await expect(page.getByTestId('node-RK-11-01')).toHaveCount(1);
  await expect(page.getByTestId('node-UTIL-A')).toHaveCount(1); // upstream of H1, in zone ELEC
  await expect(page.getByTestId('node-RK-21-01')).toHaveCount(0); // another hall

  await page.getByLabel('Zoom to zone').selectOption('all');
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(157);
  await expect(hint).toHaveCount(0);

  await page.getByRole('button', { name: 'Restore demo' }).click();
  await expect(page.getByText('Loaded Demo hall H1: 43 nodes.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Zoom to zone')).toHaveValue('all');
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(43);
});
