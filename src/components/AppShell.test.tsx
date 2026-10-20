import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { initialAnalyticalContext } from '../store/contextStore';
import { AppShell } from './AppShell';

// Zustand's SSR snapshot reads the vanilla api's getInitialState(), which is a
// creation-time capture that setState cannot change; mock the module so the
// hook reads a plain mutable object instead (same pattern as StockScreen.test).
const mockStore = vi.hoisted(() => {
  let state: Record<string, unknown> = {};
  const hook = Object.assign(
    (selector: (value: never) => unknown) => selector(state as never),
    {
      getState: () => state,
      setState: (partial: Record<string, unknown>) => {
        state = { ...state, ...partial };
      },
      getInitialState: () => state,
      reset: (next: Record<string, unknown>) => {
        state = { ...next };
      },
    },
  );
  return { hook };
});

vi.mock('../store/contextStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store/contextStore')>();
  return { ...actual, useContextStore: mockStore.hook };
});

function renderShell(): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>,
  );
}

function setStore(overrides: Record<string, unknown> = {}) {
  mockStore.hook.reset({
    ...initialAnalyticalContext,
    ticker: 'SINI',
    dataThrough: null,
    setLocale: () => {},
    ...overrides,
  });
}

describe('AppShell header badge', () => {
  beforeEach(() => setStore());

  it('shows the full replay line with the selected session date at 480px and up', () => {
    setStore({ selectedSessionDate: '2026-08-24' });
    const html = renderShell();
    expect(html).toContain('Historical Replay');
    expect(html).toContain('data through 24 Aug 2026');
  });

  it('shows the short Replay badge below 480px instead of hiding the date', () => {
    setStore({ selectedSessionDate: '2026-08-24' });
    const html = renderShell();
    expect(html).toContain('Replay · 24 Aug 2026');
  });

  it('falls back to manifest dataThrough when no session is selected', () => {
    setStore({ dataThrough: '2026-09-23' });
    const html = renderShell();
    expect(html).toMatch(/data through 23 Sep(t)? 2026/);
    expect(html).not.toContain('Replay ·');
  });
});
