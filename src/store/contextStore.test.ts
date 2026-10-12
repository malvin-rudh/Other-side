import { beforeEach, describe, expect, it } from 'vitest';
import { useContextStore } from './contextStore';

const initialState = useContextStore.getState();

beforeEach(() => {
  useContextStore.setState(initialState, true);
});

describe('context store', () => {
  it('starts with the prototype defaults and unavailable versions', () => {
    const state = useContextStore.getState();
    expect(state.ticker).toBe('SINI');
    expect(state.locale).toBe('en');
    expect(state.scenario).toBe('default');
    expect(state.dataVersion).toBe('unavailable');
    expect(state.taxonomyVersion).toBe('unavailable');
    expect(state.claimVersion).toBe('unavailable');
    expect(state.contextKey).toContain('SINI');
  });

  it('switching EN/ID changes only the locale, not the rest of the context', () => {
    const store = useContextStore.getState();
    store.setTicker('BBCA');
    store.selectSession('2026-09-21');
    store.setScenario('alt');

    const before = useContextStore.getState();
    const keyBefore = before.contextKey;

    before.setLocale('id');

    const after = useContextStore.getState();
    expect(after.locale).toBe('id');
    expect(after.ticker).toBe('BBCA');
    expect(after.selectedSessionDate).toBe('2026-09-21');
    expect(after.scenario).toBe('alt');
    expect(after.contextKey).not.toBe(keyBefore);
    expect(after.contextKey).toContain('|id|');
  });

  it('normalises tickers to upper case', () => {
    useContextStore.getState().setTicker(' sini ');
    expect(useContextStore.getState().ticker).toBe('SINI');
  });

  it('keeps briefDate out of the context key (UI-only selection)', () => {
    const keyBefore = useContextStore.getState().contextKey;
    useContextStore.getState().setBriefDate('2026-09-23');
    const after = useContextStore.getState();
    expect(after.briefDate).toBe('2026-09-23');
    expect(after.contextKey).toBe(keyBefore);
  });

  it('keeps demoMode out of the context key', () => {
    const keyBefore = useContextStore.getState().contextKey;
    useContextStore.getState().setDemoMode(true);
    const after = useContextStore.getState();
    expect(after.demoMode).toBe(true);
    expect(after.contextKey).toBe(keyBefore);
  });

  it('updates the context key when the manifest versions load', () => {
    const keyBefore = useContextStore.getState().contextKey;
    useContextStore.getState().applyManifest({
      dataVersion: 'sini-2026-08-14_2026-09-23',
      taxonomyVersion: 'taxonomy-v1',
      claimVersion: 'claims-v1',
      dataThrough: '2026-09-23',
    });
    const after = useContextStore.getState();
    expect(after.dataVersion).toBe('sini-2026-08-14_2026-09-23');
    expect(after.dataThrough).toBe('2026-09-23');
    expect(after.contextKey).not.toBe(keyBefore);
    expect(after.contextKey).toContain('sini-2026-08-14_2026-09-23');
  });

  it('leaves versions unavailable when no manifest is applied', () => {
    useContextStore.getState().applyManifest(null);
    const state = useContextStore.getState();
    expect(state.dataVersion).toBe('unavailable');
    expect(state.taxonomyVersion).toBe('unavailable');
    expect(state.claimVersion).toBe('unavailable');
    expect(state.dataThrough).toBeNull();
  });

  it('ignores an inverted period range', () => {
    useContextStore.getState().setPeriod('2026-09-23', '2026-08-14');
    const state = useContextStore.getState();
    expect(state.periodStart).toBeNull();
    expect(state.periodEnd).toBeNull();
  });
});
