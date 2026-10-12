import Ajv from 'ajv';

export type BrokerSide = 'buy' | 'sell';
export type SessionStatus = 'captured' | 'missing' | 'excluded' | 'holiday' | 'weekend';
export type BrokerGroup = 'app_facing' | 'institution_facing' | 'other_mixed' | 'unknown';
export type EvidenceStrength = 'Strong' | 'Moderate' | 'Weak' | 'Not enough data';

export interface RowSource {
  sourceFile: string;
  sourceLine: number;
  rawDate: string;
  rawTicker: string;
  rawSide: string;
  rawRank: string;
  rawBroker: string;
  rawGroup?: string;
  rawLots: string;
  rawValueIdr: string;
  rawAveragePrice?: string;
  rawFrequency?: string;
  rawSourceId?: string;
}

export interface NormalizedBrokerRow {
  id: string;
  ticker: string;
  date: string;
  side: BrokerSide;
  rank: number;
  brokerCode: string;
  netLots: number;
  netValueIdr: number;
  sourceAveragePrice?: number;
  frequency?: number;
  source: RowSource;
}

export interface RowsDocument {
  ticker: string;
  dataVersion: string;
  rows: NormalizedBrokerRow[];
}

// One trading day of the fictional sample price fixture. Null fields are
// unknown, never zero, exactly like provider bars.
export interface SamplePriceBar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

// Fictional, versioned daily prices for a sample instrument or the fictional
// sample benchmark. They are fixture inputs, never market data, and never mix
// with provider prices inside one valuation.
export interface PricesDocument {
  symbol: string;
  version: string;
  currency: 'IDR';
  exchangeTimezone: string;
  exchangeName: string;
  source: string;
  priceBasis: 'sample-fixture-daily';
  bars: SamplePriceBar[];
}

export interface SessionSummary {
  date: string;
  ticker: string;
  status: SessionStatus;
  reason: string;
  rowCounts: Record<BrokerSide, number>;
}

export interface SessionManifest {
  ticker: string;
  dataVersion: string;
  defaultWindow: {
    start: string;
    end: string;
  };
  sessions: SessionSummary[];
}

export interface BrokerProfile {
  code: string;
  name: string | null;
  group: BrokerGroup;
  identityEvidence: {
    strength: EvidenceStrength;
    reason: string;
    basis: string;
  };
  profileEvidence: {
    strength: EvidenceStrength;
    reason: {
      en: string;
      id: string;
      zh: string;
    };
    basis: string;
    sourceReference: string;
  };
  note: {
    en: string;
    id: string;
    zh: string;
  };
}

export interface BrokersDocument {
  version: string;
  brokers: BrokerProfile[];
}

export interface SiniEvent {
  id: string;
  layer: 'story' | 'health';
  eventDate?: string;
  reportingDate?: string;
  publicationDate: string;
  availableAt: string;
  source: {
    name: string;
    url: string;
  };
  text: {
    en: string;
    id: string;
    zh: string;
  };
}

export interface EventsDocument {
  ticker: string;
  version: string;
  events: SiniEvent[];
}

const side = { type: 'string', enum: ['buy', 'sell'] } as const;
const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
const safeInteger = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } as const;
const positiveInteger = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER } as const;

export const rowSourceSchema = {
  type: 'object',
  properties: {
    sourceFile: { type: 'string', minLength: 1 },
    sourceLine: { type: 'integer', minimum: 1 },
    rawDate: { type: 'string', minLength: 1 },
    rawTicker: { type: 'string', minLength: 1 },
    rawSide: { type: 'string', minLength: 1 },
    rawRank: { type: 'string', minLength: 1 },
    rawBroker: { type: 'string', minLength: 1 },
    rawGroup: { type: 'string', minLength: 1 },
    rawLots: { type: 'string', minLength: 1 },
    rawValueIdr: { type: 'string', minLength: 1 },
    rawAveragePrice: { type: 'string', minLength: 1 },
    rawFrequency: { type: 'string', minLength: 1 },
    rawSourceId: { type: 'string', minLength: 1 },
  },
  required: ['sourceFile', 'sourceLine', 'rawDate', 'rawTicker', 'rawSide', 'rawRank', 'rawBroker', 'rawLots', 'rawValueIdr'],
  additionalProperties: false,
} as const;

export const normalizedRowSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', pattern: '^[A-Z]{2,5}-\\d{8}-[BS]\\d{2}$' },
    ticker: { type: 'string', pattern: '^[A-Z]{2,5}$' },
    date,
    side,
    rank: { type: 'integer', minimum: 1, maximum: 9 },
    brokerCode: { type: 'string', pattern: '^[A-Z]{2}$' },
    netLots: positiveInteger,
    netValueIdr: positiveInteger,
    sourceAveragePrice: positiveInteger,
    frequency: positiveInteger,
    source: rowSourceSchema,
  },
  required: ['id', 'ticker', 'date', 'side', 'rank', 'brokerCode', 'netLots', 'netValueIdr', 'source'],
  additionalProperties: false,
} as const;

export const rowsDocumentSchema = {
  type: 'object',
  properties: {
    ticker: { type: 'string', pattern: '^[A-Z]{2,5}$' },
    dataVersion: { type: 'string', minLength: 1 },
    rows: { type: 'array', items: normalizedRowSchema },
  },
  required: ['ticker', 'dataVersion', 'rows'],
  additionalProperties: false,
} as const;

export const sessionManifestSchema = {
  type: 'object',
  properties: {
    ticker: { type: 'string', pattern: '^[A-Z]{2,5}$' },
    dataVersion: { type: 'string', minLength: 1 },
    defaultWindow: {
      type: 'object',
      properties: { start: date, end: date },
      required: ['start', 'end'],
      additionalProperties: false,
    },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date,
          ticker: { type: 'string', pattern: '^[A-Z]{2,5}$' },
          status: { type: 'string', enum: ['captured', 'missing', 'excluded', 'holiday', 'weekend'] },
          reason: { type: 'string', minLength: 1 },
          rowCounts: {
            type: 'object',
            properties: {
              buy: safeInteger,
              sell: safeInteger,
            },
            required: ['buy', 'sell'],
            additionalProperties: false,
          },
        },
        required: ['date', 'ticker', 'status', 'reason', 'rowCounts'],
        additionalProperties: false,
      },
    },
  },
  required: ['ticker', 'dataVersion', 'defaultWindow', 'sessions'],
  additionalProperties: false,
} as const;

export const brokersDocumentSchema = {
  type: 'object',
  properties: {
    version: { type: 'string', minLength: 1 },
    brokers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', pattern: '^[A-Z]{2}$' },
          name: { type: ['string', 'null'] },
          group: { type: 'string', enum: ['app_facing', 'institution_facing', 'other_mixed', 'unknown'] },
          identityEvidence: {
            type: 'object',
            properties: {
              strength: { type: 'string', enum: ['Strong', 'Moderate', 'Weak', 'Not enough data'] },
              reason: { type: 'string', minLength: 1 },
              basis: { type: 'string', minLength: 1 },
            },
            required: ['strength', 'reason', 'basis'],
            additionalProperties: false,
          },
          profileEvidence: {
            type: 'object',
            properties: {
              strength: { type: 'string', enum: ['Strong', 'Moderate', 'Weak', 'Not enough data'] },
              reason: {
                type: 'object',
                properties: {
                  en: { type: 'string', minLength: 1 },
                  id: { type: 'string', minLength: 1 },
                  zh: { type: 'string', minLength: 1 },
                },
                required: ['en', 'id', 'zh'],
                additionalProperties: false,
              },
              basis: { type: 'string', minLength: 1 },
              sourceReference: { type: 'string', minLength: 1 },
            },
            required: ['strength', 'reason', 'basis', 'sourceReference'],
            additionalProperties: false,
          },
          note: {
            type: 'object',
            properties: {
              en: { type: 'string', minLength: 1 },
              id: { type: 'string', minLength: 1 },
              zh: { type: 'string', minLength: 1 },
            },
            required: ['en', 'id', 'zh'],
            additionalProperties: false,
          },
        },
        required: ['code', 'name', 'group', 'identityEvidence', 'profileEvidence', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['version', 'brokers'],
  additionalProperties: false,
} as const;

export const eventsDocumentSchema = {
  type: 'object',
  properties: {
    ticker: { type: 'string', pattern: '^[A-Z]{2,5}$' },
    version: { type: 'string', minLength: 1 },
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1 },
          layer: { type: 'string', enum: ['story', 'health'] },
          eventDate: date,
          reportingDate: date,
          publicationDate: date,
          availableAt: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T00:00:00\\+07:00$' },
          source: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1 },
              url: { type: 'string', minLength: 1 },
            },
            required: ['name', 'url'],
            additionalProperties: false,
          },
          text: {
            type: 'object',
            properties: {
              en: { type: 'string', minLength: 1 },
              id: { type: 'string', minLength: 1 },
              zh: { type: 'string', minLength: 1 },
            },
            required: ['en', 'id', 'zh'],
            additionalProperties: false,
          },
        },
        required: ['id', 'layer', 'publicationDate', 'availableAt', 'source', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['ticker', 'version', 'events'],
  additionalProperties: false,
} as const;

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });

export const validateRowsDocument = ajv.compile<RowsDocument>(rowsDocumentSchema);
export const validateSessionManifest = ajv.compile<SessionManifest>(sessionManifestSchema);
export const validateBrokersDocument = ajv.compile<BrokersDocument>(brokersDocumentSchema);
export const validateEventsDocument = ajv.compile<EventsDocument>(eventsDocumentSchema);

const positiveOrNull = {
  anyOf: [{ type: 'number', exclusiveMinimum: 0 }, { type: 'null' }],
} as const;

const countOrNull = {
  anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }],
} as const;

export const pricesDocumentSchema = {
  type: 'object',
  properties: {
    symbol: { type: 'string', pattern: '^[A-Z0-9.\\-^]{1,24}$' },
    version: { type: 'string', minLength: 1 },
    currency: { type: 'string', enum: ['IDR'] },
    exchangeTimezone: { type: 'string', minLength: 1 },
    exchangeName: { type: 'string', minLength: 1 },
    source: { type: 'string', minLength: 1 },
    priceBasis: { type: 'string', enum: ['sample-fixture-daily'] },
    bars: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          date,
          open: positiveOrNull,
          high: positiveOrNull,
          low: positiveOrNull,
          close: positiveOrNull,
          volume: countOrNull,
        },
        required: ['date', 'open', 'high', 'low', 'close', 'volume'],
        additionalProperties: false,
      },
    },
  },
  required: ['symbol', 'version', 'currency', 'exchangeTimezone', 'exchangeName', 'source', 'priceBasis', 'bars'],
  additionalProperties: false,
} as const;

export const validatePricesDocument = ajv.compile<PricesDocument>(pricesDocumentSchema);
