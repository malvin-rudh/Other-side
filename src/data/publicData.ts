import { useEffect, useState } from 'react';
import type {
  BrokerProfile,
  BrokersDocument,
  EventsDocument,
  NormalizedBrokerRow,
  RowsDocument,
  SessionManifest,
  SessionSummary,
  SiniEvent,
} from './schemas';
import {
  validateBrokersDocument,
  validateEventsDocument,
  validateRowsDocument,
  validateSessionManifest,
} from './schemas';

export interface PublicDataVersions {
  data: string;
  taxonomy: string;
  claims: string;
}

export interface PublicData {
  rows: NormalizedBrokerRow[];
  sessions: SessionSummary[];
  defaultWindow: { start: string; end: string };
  brokers: BrokerProfile[];
  events: SiniEvent[];
  versions: PublicDataVersions;
}

export type PublicDataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: PublicData };

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`fetch failed: ${url} (${res.status})`);
  return res.json();
}

export async function loadPublicData(ticker: string, fetchImpl: typeof fetch = fetch): Promise<PublicData> {
  const base = `/data/${encodeURIComponent(ticker.toLowerCase())}`;
  const [rowsRaw, sessionsRaw, brokersRaw, eventsRaw] = await Promise.all([
    fetchJson(`${base}/rows.json`, fetchImpl),
    fetchJson(`${base}/sessions.json`, fetchImpl),
    fetchJson('/data/brokers.json', fetchImpl),
    fetchJson(`${base}/events.json`, fetchImpl),
  ]);

  if (!validateRowsDocument(rowsRaw)) throw new Error('rows.json failed schema validation');
  if (!validateSessionManifest(sessionsRaw)) throw new Error('sessions.json failed schema validation');
  if (!validateBrokersDocument(brokersRaw)) throw new Error('brokers.json failed schema validation');
  if (!validateEventsDocument(eventsRaw)) throw new Error('events.json failed schema validation');

  const rowsDoc = rowsRaw as RowsDocument;
  const sessionsDoc = sessionsRaw as SessionManifest;
  const brokersDoc = brokersRaw as BrokersDocument;
  const eventsDoc = eventsRaw as EventsDocument;

  if (rowsDoc.ticker !== ticker || sessionsDoc.ticker !== ticker || eventsDoc.ticker !== ticker) {
    throw new Error(`data ticker mismatch for ${ticker}`);
  }

  return {
    rows: rowsDoc.rows,
    sessions: sessionsDoc.sessions,
    defaultWindow: sessionsDoc.defaultWindow,
    brokers: brokersDoc.brokers,
    events: eventsDoc.events,
    versions: {
      data: sessionsDoc.dataVersion,
      taxonomy: brokersDoc.version,
      claims: eventsDoc.version,
    },
  };
}

export function usePublicData(ticker: string | null): PublicDataState {
  const [state, setState] = useState<PublicDataState>({ status: 'loading' });

  useEffect(() => {
    if (ticker === null) {
      setState({ status: 'loading' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    loadPublicDataCached(ticker)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return state;
}

// Several screens now load several instruments side by side (Brief panels,
// feed rows). The four JSON files per instrument are static in this prototype,
// so one shared in-flight promise per ticker keeps repeat mounts free without
// changing what any screen is allowed to show.
const datasetCache = new Map<string, Promise<PublicData>>();

function loadPublicDataCached(ticker: string): Promise<PublicData> {
  const cached = datasetCache.get(ticker);
  if (cached !== undefined) return cached;
  const promise = loadPublicData(ticker);
  promise.catch(() => datasetCache.delete(ticker));
  datasetCache.set(ticker, promise);
  return promise;
}
