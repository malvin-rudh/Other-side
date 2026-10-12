import { expect, test } from '@playwright/test';

const STREAK_SENTENCE =
  'Institution-facing brokers were net buyers in each of the last five sessions (18 Aug to 24 Aug, visible sample).';
const SELL_FALLBACK = 'The available data does not support a five-session buying claim.';
const LIVE_FAILED = 'The live answer did not arrive or did not validate.';
const LIVE_BADGE = 'Live Qwen · historical data';

async function openStock(page: import('@playwright/test').Page) {
  await page.goto('/stock/SINI');
  await expect(page.getByRole('button', { name: 'Jump to 24 Aug 2026' })).toBeVisible();
}

test('24 Aug view leaks no September data into card, charts or strips', async ({ page }) => {
  await openStock(page);
  await page.getByRole('button', { name: 'Jump to 24 Aug 2026' }).click();

  // The five-session streak claim is bounded at the selected session.
  await expect(page.getByText(STREAK_SENTENCE)).toBeVisible();

  // Expand every card section so the capped window claims are in the DOM too.
  const showAll = page.getByRole('button', { name: /Show all \(/ });
  while ((await showAll.count()) > 0) {
    await showAll.first().click();
  }

  const card = page.locator('article:has(h2#otherside-card-title)');
  const proxyChart = page.getByLabel(/Daily net-flow implied price reference, \d+ captured sessions/);
  const groupChart = page.getByLabel(/Cumulative group net flows over \d+ sessions/);
  const changedStrip = page.getByLabel('What changed since the previous session');
  const thesis = page.getByLabel('Thesis check');

  for (const region of [card, proxyChart, groupChart, changedStrip, thesis]) {
    await expect(region.getByText(/\bSep\b|September|2026-09/)).toHaveCount(0);
  }
});

test('Sell sheet gates the C12/C13 streak wording on claim availability', async ({ page }) => {
  await openStock(page);

  await page.getByRole('button', { name: 'Jump to 24 Aug 2026' }).click();
  await page.getByRole('button', { name: 'Simulate Sell' }).click();
  const sheet24 = page.getByRole('dialog', { name: 'Who am I trading with?' });
  await expect(sheet24.getByText(STREAK_SENTENCE)).toBeVisible();
  await expect(sheet24.getByText(/Five positive sessions: 18 Aug, 19 Aug, 20 Aug, 21 Aug, 24 Aug/)).toBeVisible();
  await sheet24.getByRole('button', { name: 'Close simulation' }).click();

  await page.getByRole('button', { name: /Jump to 23 Sep/ }).click();
  await page.getByRole('button', { name: 'Simulate Sell' }).click();
  const sheet23 = page.getByRole('dialog', { name: 'Who am I trading with?' });
  await expect(sheet23.getByText(SELL_FALLBACK)).toBeVisible();
  await expect(sheet23.getByText('net buyers in each of the last five sessions')).toHaveCount(0);
  await expect(sheet23.getByText(/Five positive sessions:/)).toHaveCount(0);
});

async function armLiveEndpoint(page: import('@playwright/test').Page) {
  await page.getByLabel('Live endpoint').fill('/api/explain');
  await page.getByLabel('Demo token').fill('release-check-token');
}

test('stale live response with a mismatched context key is rejected, not rendered', async ({ page }) => {
  await openStock(page);
  await page.route('**/api/explain', async (route) => {
    const body = route.request().postDataJSON() as { request_id?: string };
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: body.request_id ?? 'unknown',
        contextKey: 'stale-or-forged-context-key',
        versions: { data: 'v', taxonomy: 'v', claims: 'v' },
        mode: 'live',
        model: { id: 'qwen-forgery', structuredMode: 'json' },
        generatedAt: new Date().toISOString(),
        usage: {},
        plan: { answer_kind: 'unavailable', claims: [], follow_up_ids: [] },
      }),
    });
  });

  await armLiveEndpoint(page);
  await page.getByRole('button', { name: 'Institutions are accumulating' }).click();
  await page.getByRole('button', { name: 'Ask live' }).click();

  await expect(page.getByText(LIVE_FAILED)).toBeVisible();
  await expect(page.getByText('Try one of these:')).toBeVisible();
  await expect(page.getByText(LIVE_BADGE)).toHaveCount(0);
});

test('live endpoint failure falls back to an honest unavailable message', async ({ page }) => {
  await openStock(page);
  await page.route('**/api/explain', (route) =>
    route.fulfill({ status: 503, contentType: 'text/plain', body: 'live model disabled' }),
  );

  await armLiveEndpoint(page);
  await page.getByRole('button', { name: 'Institutions are accumulating' }).click();
  await page.getByRole('button', { name: 'Ask live' }).click();

  await expect(page.getByText(LIVE_FAILED)).toBeVisible();
  await expect(
    page.getByText('The saved answer finds the evidence insufficient for this thesis at this point.'),
  ).toBeVisible();
  await expect(page.getByText('Try one of these:')).toBeVisible();
  await expect(page.getByText(LIVE_BADGE)).toHaveCount(0);
});
