// Loads the bundled public/data files for one ticker and validates them with
// the same schemas the build script enforces. Results are cached per ticker.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateBrokersDocument,
  validateEventsDocument,
  validateRowsDocument,
  validateSessionManifest,
  type BrokerProfile,
  type BrokersDocument,
  type EventsDocument,
  type NormalizedBrokerRow,
  type RowsDocument,
  type SessionManifest,
  type SessionSummary,
  type SiniEvent,
} from '../src/data/schemas';
import type { FactsData } from '../src/engine/facts';
import { CLAIMS_VERSION } from '../src/ai/versions';

export interface ServerDataBundle extends FactsData {
  ticker: string;
  defaultWindow: { start: string; end: string };
  versions: { data: string; taxonomy: string; claims: string };
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map<string, ServerDataBundle>();

export function loadServerData(ticker: string): ServerDataBundle {
  const cached = cache.get(ticker);
  if (cached) return cached;

  const base = path.join(ROOT, 'public', 'data');
  const lower = ticker.toLowerCase();
  const rowsDoc = JSON.parse(readFileSync(path.join(base, lower, 'rows.json'), 'utf8')) as unknown;
  const sessionsDoc = JSON.parse(readFileSync(path.join(base, lower, 'sessions.json'), 'utf8')) as unknown;
  const brokersDoc = JSON.parse(readFileSync(path.join(base, 'brokers.json'), 'utf8')) as unknown;
  const eventsDoc = JSON.parse(readFileSync(path.join(base, lower, 'events.json'), 'utf8')) as unknown;

  if (!validateRowsDocument(rowsDoc)) throw new Error(`rows.json failed schema validation for ${ticker}`);
  if (!validateSessionManifest(sessionsDoc)) throw new Error(`sessions.json failed schema validation for ${ticker}`);
  if (!validateBrokersDocument(brokersDoc)) throw new Error('brokers.json failed schema validation');
  if (!validateEventsDocument(eventsDoc)) throw new Error(`events.json failed schema validation for ${ticker}`);

  const rows = (rowsDoc as RowsDocument).rows as NormalizedBrokerRow[];
  const sessions = (sessionsDoc as SessionManifest).sessions as SessionSummary[];
  const brokers = (brokersDoc as BrokersDocument).brokers as BrokerProfile[];
  const events = (eventsDoc as EventsDocument).events as SiniEvent[];

  const bundle: ServerDataBundle = {
    rows,
    sessions,
    brokers,
    events,
    ticker: (sessionsDoc as SessionManifest).ticker,
    defaultWindow: (sessionsDoc as SessionManifest).defaultWindow,
    versions: {
      data: (sessionsDoc as SessionManifest).dataVersion,
      taxonomy: (brokersDoc as BrokersDocument).version,
      // Claim-contract version from code, kept separate from the events dataset
      // version so the server context key matches the client for the same build.
      claims: CLAIMS_VERSION,
    },
  };
  cache.set(ticker, bundle);
  return bundle;
}
