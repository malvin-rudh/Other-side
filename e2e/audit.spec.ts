import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { PublicData } from '../src/data/publicData';
import type { BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../src/data/schemas';
import { sessionAvailableAt } from '../src/engine/predicates';
import type { FactsContext, FactsData } from '../src/engine/facts';
import { buildStockView } from '../src/engine/stockView';
import { buildTradeContext } from '../src/engine/tradeContext';

// Mirrors src/i18n formatters (that module loads JSON dictionaries, which native ESM rejects).
function formatSessionDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}
function formatShortDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as never;

const sessionsDoc = readJson('public/data/sini/sessions.json');
const rowsDoc = readJson('public/data/sini/rows.json');
const brokersDoc = readJson('public/data/brokers.json');
const eventsDoc = readJson('public/data/sini/events.json');

const data: PublicData = {
  rows: rowsDoc.rows as NormalizedBrokerRow[],
  sessions: sessionsDoc.sessions as SessionSummary[],
  defaultWindow: sessionsDoc.defaultWindow,
  brokers: brokersDoc.brokers as BrokerProfile[],
  events: eventsDoc.events as SiniEvent[],
  versions: {
    data: sessionsDoc.dataVersion,
    taxonomy: brokersDoc.version,
    claims: eventsDoc.version,
  },
};

const factsData: FactsData = {
  rows: data.rows,
  sessions: data.sessions,
  brokers: data.brokers,
  events: data.events,
};

const fmtInt = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value);
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${fmtInt(Math.abs(value))}`;
const ranked = (value: number) => `${value > 0 ? '+' : ''}${fmtInt(value)}`;

const SIGNED_TOKEN = /[+−-]\d[\d,]*/g;
const UNSIGNED_TOKEN = /[0-9][0-9,]*(?:\.\d+)?k?/g;

function tokens(text: string, pattern: RegExp): string[] {
  return text.match(pattern) ?? [];
}

function factsContext(sessionDate: string): FactsContext {
  return {
    ticker: 'SINI',
    sessionDate,
    cutoffAt: sessionAvailableAt(sessionDate),
    periodStart: data.defaultWindow.start,
    periodEnd: data.defaultWindow.end,
    scenario: 'default',
    locale: 'en',
    dataVersion: data.versions.data,
    taxonomyVersion: data.versions.taxonomy,
    claimVersion: data.versions.claims,
  };
}

async function openSession(page: import('@playwright/test').Page, dateLabel: RegExp) {
  await page.goto('/stock/SINI');
  await page.getByRole('button', { name: dateLabel }).click();
}

async function expandCard(page: import('@playwright/test').Page) {
  const showAll = page.getByRole('button', { name: /Show all \(/ });
  while ((await showAll.count()) > 0) {
    await showAll.first().click();
  }
}

async function auditScreen(page: import('@playwright/test').Page, sessionDate: string) {
  const view = buildStockView(factsContext(sessionDate), data);

  // Header reference and period.
  const headerLine = page.getByText(/implied price reference, not close/).locator('xpath=..');
  await expect(headerLine).toContainText(`Rp${fmtInt(view.headerProxy.display!)}`);
  await expect(headerLine).toContainText(formatShortDate(view.headerProxy.date!));
  await expect(page.getByText(/^Period:/)).toContainText(
    `Period: ${formatSessionDate(view.effectiveWindow.start)} → ${formatSessionDate(view.effectiveWindow.end)}`,
  );

  // Changed strip: every signed number equals a moved group's from/to value, and vice versa.
  const changedRegion = page.getByLabel('What changed since the previous session');
  const changedText = (await changedRegion.textContent()) ?? '';
  const changedDom = tokens(changedText, SIGNED_TOKEN);
  const changedEngine = (view.changed?.moves ?? []).flatMap((move) => [signed(move.fromLots), signed(move.toLots)]);
  expect(changedDom.sort()).toEqual(changedEngine.sort());

  // Flow panel: group nets (U+2212 signed, bare 0) and ranking values (Intl signed).
  const flowText = (await page.getByRole('tabpanel', { name: 'Flow', exact: true }).textContent()) ?? '';
  const flowEngine = [
    ...view.flow.groups.map((group) => signed(group.lots)),
    ...view.flow.topBuyers.map((entry) => ranked(entry.netLots)),
    ...view.flow.topSellers.map((entry) => ranked(entry.netLots)),
  ];
  expect(tokens(flowText, SIGNED_TOKEN).sort()).toEqual(flowEngine.filter((t) => /^[+−-]/.test(t)).sort());
  expect(tokens(flowText, UNSIGNED_TOKEN).sort()).toEqual(
    [
      ...view.flow.groups.map((group) => fmtInt(Math.abs(group.lots))),
      ...view.flow.topBuyers.map((entry) => fmtInt(Math.abs(entry.netLots))),
      ...view.flow.topSellers.map((entry) => fmtInt(Math.abs(entry.netLots))),
    ].sort(),
  );

  // Card: after expanding every section, the visible numbers are exactly the claim wording numbers.
  await expandCard(page);
  const card = page.locator('article:has(h2#otherside-card-title)');
  const listTexts = await card.locator('ul').allTextContents();
  const cardDom = tokens(listTexts.join(' '), UNSIGNED_TOKEN);
  const allClaims = [...view.card.observed, ...view.card.interpretation, ...view.card.unknown];
  const cardEngine = allClaims.flatMap((claim) => tokens(claim.wording, UNSIGNED_TOKEN));
  expect(cardDom.sort()).toEqual(cardEngine.sort());

  // Story and health: every reviewed event sentence appears verbatim.
  const storyText = (await page.getByRole('tabpanel', { name: 'Story', exact: true }).textContent()) ?? '';
  for (const event of view.story) {
    expect(storyText).toContain(event.text);
  }
  const healthText = (await page.getByRole('tabpanel', { name: 'Health', exact: true }).textContent()) ?? '';
  for (const event of view.health) {
    expect(healthText).toContain(event.text);
  }
}

test('24 Aug screen and sell sheet numbers match the engine', async ({ page }) => {
  await openSession(page, /Jump to 24 Aug/);
  await auditScreen(page, '2026-08-24');

  const trade = buildTradeContext('sell', factsContext('2026-08-24'), factsData);
  await page.getByRole('button', { name: 'Simulate Sell' }).click();
  const sheet = page.getByRole('dialog', { name: 'Who am I trading with?' });
  await expect(sheet).toContainText(trade.sellWording!);
  if (trade.weakLink) {
    await expect(sheet).toContainText(signed(trade.weakLink.candidateValue));
    await expect(sheet).toContainText(signed(trade.weakLink.otherValue));
  }
});

test('23 Sep screen and buy sheet numbers match the engine', async ({ page }) => {
  await openSession(page, /Jump to 23 Sep/);
  await auditScreen(page, '2026-09-23');

  const buy = buildTradeContext('buy', factsContext('2026-09-23'), factsData);
  await page.getByRole('button', { name: 'Simulate Buy' }).click();
  const sheet = page.getByRole('dialog', { name: 'Who am I trading with?' });
  await expect(sheet).toContainText(`Rp${fmtInt(buy.today!.display)}`);
  await expect(sheet).toContainText(`Rp${fmtInt(buy.window!.display)}`);
  await sheet.getByRole('button', { name: 'Close simulation' }).click();

  const sell = buildTradeContext('sell', factsContext('2026-09-23'), factsData);
  await page.getByRole('button', { name: 'Simulate Sell' }).click();
  const sellSheet = page.getByRole('dialog', { name: 'Who am I trading with?' });
  await expect(sellSheet).toContainText('does not support a five-session buying claim');
  if (sell.weakLink) {
    await expect(sellSheet).toContainText(signed(sell.weakLink.candidateValue));
    await expect(sellSheet).toContainText(signed(sell.weakLink.otherValue));
  }
});
