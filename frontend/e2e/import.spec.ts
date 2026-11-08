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
  // Racks are grouped by row on the map, so the hall's racks appear as row blocks (node-row:RK-11, …).
  await expect(page.getByTestId('node-row:RK-11')).toHaveCount(1);
  await expect(page.getByTestId('node-UTIL-A')).toHaveCount(1); // upstream of H1, in zone ELEC
  await expect(page.getByTestId('node-row:RK-21')).toHaveCount(0); // another hall

  await page.getByLabel('Zoom to zone').selectOption('all');
  await expect(page.getByTestId('node-row:RK-21')).toHaveCount(1); // other halls appear on Whole site
  await expect(hint).toHaveCount(0);

  await page.getByRole('button', { name: 'Admin' }).click(); // Import / Export / Restore live in the Admin menu
  await page.getByRole('menuitem', { name: 'Restore demo' }).click();
  await expect(page.getByText('Loaded Demo hall H1: 43 nodes.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Zoom to zone')).toHaveValue('all');
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(29); // 27 equipment + 2 rack rows
});
