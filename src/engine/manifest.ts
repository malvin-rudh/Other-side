import Ajv from 'ajv';

export interface Manifest {
  dataVersion: string;
  taxonomyVersion: string;
  claimVersion: string;
  dataThrough: string | null;
}

const manifestSchema = {
  type: 'object',
  properties: {
    dataVersion: { type: 'string', minLength: 1 },
    taxonomyVersion: { type: 'string', minLength: 1 },
    claimVersion: { type: 'string', minLength: 1 },
    dataThrough: { type: ['string', 'null'] },
  },
  required: ['dataVersion', 'taxonomyVersion', 'claimVersion', 'dataThrough'],
  additionalProperties: false,
};

const ajv = new Ajv();
const validateManifest = ajv.compile<Manifest>(manifestSchema);

export function parseManifest(data: unknown): Manifest | null {
  if (validateManifest(data)) {
    return data;
  }
  return null;
}

export async function fetchManifest(
  url = '/data/manifest.json',
  fetchImpl: typeof fetch = fetch,
): Promise<Manifest | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    return parseManifest(await res.json());
  } catch {
    return null;
  }
}
