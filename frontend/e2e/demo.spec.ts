import { expect, test, type Page } from '@playwright/test';

// Walks docs/DEMO.md beat by beat and checks every number the script says out loud. If this fails, the demo
// script and the app disagree: fix whichever one is wrong before rehearsing.

const node = (page: Page, id: string) => page.getByTestId(`node-${id}`);
const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name });
const lostStat = (page: Page) => page.getByTestId('stat-Racks and workloads lost');

async function setState(page: Page, id: string, state: 'maintenance' | 'failed') {
  // Click the equipment to select it, then set its state from the selection card.
  await node(page, id).click();
  await page.getByRole('button', { name: state === 'failed' ? 'Fail' : 'Maintenance', exact: true }).click();
  await expect(node(page, id)).toHaveAttribute('data-state', state === 'failed' ? 'down' : 'maint');
}

async function resetScenario(page: Page) {
  const reset = page.getByRole('button', { name: 'Reset scenario' });
  if (await reset.isEnabled()) await reset.click();
}

const timings: [string, number][] = [];
async function beat(name: string, body: () => Promise<void>) {
  const t0 = Date.now();
  await test.step(name, body);
  timings.push([name, Date.now() - t0]);
}

test.afterAll(() => {
  console.log('\nApp time per beat (excludes talking):');
  for (const [name, ms] of timings) console.log(`  ${(ms / 1000).toFixed(1).padStart(5)} s  ${name}`);
});

test('Pump A and ATS-1 demo, as scripted in docs/DEMO.md', async ({ page }) => {
  await page.goto('/#/preflight');

  await beat('1. the claim: map loads with the demo hall', async () => {
    await expect(page.getByText('Preflight · Demo hall H1')).toBeVisible();
    // 27 pieces of equipment plus 2 rack rows (R1, R2); racks are grouped by row until a row is expanded.
    await expect(page.locator('[data-testid^="node-"]')).toHaveCount(29);
  });

  await beat('2. rehearse: Pump A in maintenance', async () => {
    await setState(page, 'PUMP-A', 'maintenance');
    await expect(lostStat(page)).toContainText('0 · 0 kW');
    await tab(page, 'Weak points').click();
    await expect(page.getByText('Single points of failure:')).toContainText('ATS-2, MCC-B, PUMP-B');
  });

  const finding = page.locator('article', { hasText: 'MCC-B is fed from ATS-1, not ATS-2 as documented' });
  await beat('3. the records disagree', async () => {
    await tab(page, 'Findings').click();
    await expect(finding).toContainText('97% confidence');
    for (const doc of ['CHG-2291', 'WO-4471', 'MLOG-0212', 'OLD-001']) await expect(finding).toContainText(doc);
    await expect(finding).toContainText('If true: ATS-1 becomes a single point of failure; 9 critical services drop to N.');
    const rejected = page.locator('details', { hasText: 'Rejected record claims' });
    await rejected.locator('summary').click();
    await expect(rejected.locator('li', { hasText: 'WO-3920' })).toContainText('temporary connection that was later removed');
    await expect(rejected.locator('li', { hasText: 'WO-5108' })).toContainText("unknown equipment 'PUMP-C'");
  });

  await beat('4. confirm it', async () => {
    await page.locator('#pf-actor').fill('rehearsal');
    await finding.getByRole('button', { name: 'Confirm' }).click();
    await expect(finding).toContainText('confirmed');
    await resetScenario(page);
    await tab(page, 'Weak points').click();
    await expect(page.getByText('Single points of failure:')).toContainText('ATS-1');
  });

  await beat('5. what that costs: ATS-1 fails', async () => {
    await setState(page, 'ATS-1', 'failed');
    await tab(page, 'Impact').click();
    await expect(lostStat(page)).toContainText('18 · 400 kW');
    await expect(page.getByText('Why it failed')).toBeVisible();
  });

  await beat('5b. optional: both utilities fail', async () => {
    await resetScenario(page);
    await setState(page, 'UTIL-A', 'failed');
    await setState(page, 'UTIL-B', 'failed');
    await expect(lostStat(page)).toContainText('0 · 0 kW');
    await expect(page.getByText(/^18 racks or workloads come back once things settle/)).toBeVisible();
  });

  await beat('6. pick the window', async () => {
    await resetScenario(page);
    await tab(page, 'Plan').click();
    await page.locator('#pf-plan-nodes').fill('PUMP-A');
    await page.locator('#pf-plan-hours').fill('6');
    await page.locator('#pf-plan-from').fill('0');
    await page.locator('#pf-plan-to').fill('48');
    await page.getByRole('button', { name: 'Find the safest window' }).click();
    await expect(page.getByText('52 windows and mitigations simulated.', { exact: false })).toBeVisible();
    const rows = page.locator('label').filter({ hasText: /hour \d+–\d+/ });
    await expect(rows.first()).toContainText('hour 6–12');
    await expect(rows.first()).toContainText('recommended', { ignoreCase: true });
    await expect(rows.first()).toContainText('single points ATS-1, MCC-B, PUMP-B');
    const unmitigated = rows.filter({ hasNotText: 'with ' });
    for (const text of await unmitigated.allInnerTexts()) expect(text).toContain('ATS-1');
    await expect(rows.filter({ hasText: 'hour 0–6' })).toContainText('lower headroom (18%) than the recommended plan (33%)');
  });

  await beat('7. ask', async () => {
    await tab(page, 'Ask').click();
    await page.locator('#pf-question').fill('Are Pump A and Pump B independent?');
    await page.locator('form').getByRole('button', { name: 'Ask' }).click();
    await expect(page.getByText('scripted planner (no model)')).toBeVisible();
    const log = page.locator('li', { hasText: /^t\d+ / });
    await expect(page.getByText('PUMP-A and PUMP-B share a single point of failure: ATS-1')).toBeVisible({ timeout: 30_000 });
    const tools = (await log.allInnerTexts()).map((t) => t.split(' ')[1].split('(')[0]);
    expect(tools).toEqual(['get_neighbors', 'get_neighbors', 'find_cut_sets', 'search_docs']);
  });
});
