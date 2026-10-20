import { expect, test } from '@playwright/test';

test('stock screen fits without horizontal overflow at 390, 768 and 1440', async ({ page }) => {
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/stock/SINI');
    await expect(page.getByRole('heading', { name: 'SINI · PT Singaraja Putra' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jump to 24 Aug 2026' })).toBeVisible();
    const overflowPx = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflowPx, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test('sell sheet traps focus and Esc returns focus to its trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/stock/SINI');

  const sellButton = page.getByRole('button', { name: 'Simulate Sell' });
  await sellButton.click();

  const dialog = page.getByRole('dialog', { name: 'Who am I trading with?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close simulation' })).toBeFocused();

  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  const focusContained = await page.evaluate(() => {
    const panel = document.querySelector('[role="dialog"]');
    return panel !== null && panel.contains(document.activeElement);
  });
  expect(focusContained).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(sellButton).toBeFocused();
});
