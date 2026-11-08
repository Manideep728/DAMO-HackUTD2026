import { expect, test, type Page } from '@playwright/test';

// The liquid-cooling Modernize project against a real backend: one shared equipment model, wrong-rack
// leak sensor, firmware revalidation, readiness, and the low-flow incident on the console.

const next = (page: Page) => page.getByTestId('retrofit-next');

async function step(page: Page, label: RegExp) {
  await expect(next(page)).toContainText(label);
  await next(page).click();
}

test('liquid cooling starts with the shared equipment model inside Modernize', async ({ page }) => {
  await page.goto('/#/modernize/retrofit');

  const workflows = page.getByRole('navigation', { name: 'Workflows' });
  await expect(workflows.getByRole('link')).toHaveText(['Operate', 'Preflightwhat-if', 'Modernizeprojects']);
  await expect(page.getByRole('navigation', { name: 'Modernization projects' }).getByRole('link')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Start with the equipment model' })).toBeVisible();
  await expect(page.getByTestId('retrofit-model')).toBeVisible();
  await expect(page.getByTestId('retrofit-model')).toContainText('CDU-1');
  await expect(page.getByRole('link', { name: 'Review the adapter mapping' })).toHaveAttribute('href', '#/modernize/retrofit/mapping');
});

test('retired peer workflows redirect into their Modernize steps', async ({ page }) => {
  await page.goto('/#/verify');
  await expect(page).toHaveURL(/#\/modernize\/test$/);
  await expect(page.getByRole('heading', { name: 'Test the whole alert path' })).toBeVisible();

  await page.goto('/#/retrofit');
  await expect(page).toHaveURL(/#\/modernize\/retrofit\/mapping$/);
  await expect(page.getByRole('navigation', { name: 'Liquid-cooling modernization steps' })).toBeVisible();
});

test('wrong-rack leak sensor: fail, confirm, diff, pass, regression, second site', async ({ page }) => {
  await page.goto('/#/modernize/retrofit/mapping');
  await expect(page.getByText('Constructed demo fault, not an Equinix incident')).toBeVisible();
  await expect(page.getByText('Backend live')).toBeVisible();

  await step(page, /Run behavior tests/);
  const failed = page.getByTestId('artifact-failed');
  await expect(failed.getByText('Schema/type check passed')).toBeVisible();
  await expect(failed.getByText('Behavior 7/8')).toBeVisible();
  await expect(failed.getByTestId('case-leak-R3-01')).toHaveAttribute('data-pass', 'false');
  await expect(failed.getByText('leak under R3-01 (zone 2) published as R3-02')).toBeVisible();

  await step(page, /Trace the failure/);
  await expect(page.getByTestId('drawing-quote')).toHaveText('Leak detection zone 2 sensing cable runs beneath the R3-01 (Rack A) drip tray.');

  await expect(next(page)).toBeDisabled();  // no name, no decision
  await page.getByLabel('Engineer name').fill('Jordan Test');
  await step(page, /Confirm the physical association/);
  await expect(page.getByTestId('decision-author')).toHaveText('Jordan Test');

  await step(page, /Generate the change/);
  const diff = page.getByTestId('artifact-diff');
  await expect(diff.getByText('+    location: R3-01')).toBeVisible();
  await expect(diff.getByText('-    location: R3-02')).toBeVisible();

  await step(page, /Re-run the same tests/);
  await step(page, /Save as a regression test/);
  const reg = page.getByTestId('artifact-regression');
  await expect(reg.getByText('Behavior 9/9')).toBeVisible();
  await expect(reg.locator('[data-testid^="case-regression-"]')).toHaveAttribute('data-pass', 'true');

  await step(page, /Run on a second site/);
  const site2 = page.getByTestId('site2');
  await expect(site2.getByText('Before: 6/10')).toBeVisible();
  await step(page, /Fix site 2 the same way/);
  await expect(site2.getByText(/: 10\/10$/)).toBeVisible();
});

test('firmware change waits for approval, then readiness keeps field checks open', async ({ page }) => {
  await page.goto('/#/modernize/retrofit/firmware');
  await page.getByTestId('fw-apply').click();
  await expect(page.getByText('Old mapping on the new firmware: 5/6')).toBeVisible();
  await expect(page.getByText('Updated mapping: 6/6')).toBeVisible();
  const before = await page.getByTestId('fw-pkg').innerText();
  await page.getByLabel('Engineer name').fill('Jordan Test');
  await page.getByTestId('fw-approve').click();
  await expect(page.getByTestId('fw-approved')).toContainText(`now v${Number(before.slice(1)) + 1}`);

  await page.goto('/#/modernize/retrofit/handover');
  await expect(page.getByTestId('readiness')).toContainText('Software tests passed');
  await expect(page.getByTestId('field-open')).toHaveText('7');
  await page.getByLabel('Engineer name').fill('Jordan Test');
  await page.getByRole('button', { name: 'Record witnessed pass' }).click();
  await expect(page.getByTestId('field-open')).toHaveText('6');
  await expect(page.getByTestId('handover')).toContainText('V-R3-01');
});

test('low-flow incident: running is not adequate flow; close only after both recover', async ({ page }) => {
  await page.goto('/#/?scenario=lowflow');
  const inc = page.getByTestId('lowflow-incident');
  await expect(inc).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('incident-wording')).toContainText('Cooling degradation suspected; cause unconfirmed');
  await expect(inc.getByRole('link', { name: /R3-01/ })).toHaveAttribute('href', /site=retrofit&focus=R3-01/);
  await expect(page.getByTestId('close-incident')).toBeDisabled();
  for (const i of [0, 1]) {
    await page.getByTestId(`owner-${i}`).getByRole('button', { name: 'Acknowledge' }).click();
    await page.getByTestId(`owner-${i}`).getByRole('button', { name: /loop checks|workload impact/ }).click();
  }
  await page.getByRole('button', { name: 'Watch recovery' }).click();
  await expect(page.getByTestId('close-incident')).toBeEnabled({ timeout: 40_000 });
  await page.getByTestId('close-incident').click();
  await expect(page.getByTestId('closed')).toBeVisible();
  await page.getByRole('button', { name: 'Propose as a regression test' }).click();
  await expect(page.getByTestId('lesson')).toContainText(/Proposed regression R-\d+ is pending review/);

  await page.getByRole('tab', { name: 'Stale telemetry' }).click();
  await expect(page.getByTestId('visibility-card')).toContainText('No failure is inferred and no shutdown is advised', { timeout: 30_000 });
});
