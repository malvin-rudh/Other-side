import { describe, expect, it } from 'vitest';
import { fetchManifest, parseManifest } from './manifest';

const validManifest = {
  dataVersion: 'sini-2026-08-14_2026-09-23',
  taxonomyVersion: 'taxonomy-v1',
  claimVersion: 'claims-v1',
  dataThrough: '2026-09-23',
};

describe('parseManifest', () => {
  it('accepts a valid manifest', () => {
    expect(parseManifest(validManifest)).toEqual(validManifest);
  });

  it('accepts a null dataThrough', () => {
    expect(parseManifest({ ...validManifest, dataThrough: null })).toEqual({
      ...validManifest,
      dataThrough: null,
    });
  });

  it('rejects malformed manifests at runtime', () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest('nope')).toBeNull();
    expect(parseManifest({ ...validManifest, dataVersion: 7 })).toBeNull();
    expect(parseManifest({ ...validManifest, dataThrough: 20260923 })).toBeNull();
    expect(parseManifest({ dataVersion: 'x' })).toBeNull();
    expect(parseManifest({ ...validManifest, extra: true })).toBeNull();
  });
});

describe('fetchManifest', () => {
  const jsonResponse = (body: unknown, ok = true): Response =>
    ({ ok, json: async () => body }) as Response;

  it('returns the manifest for a valid JSON response', async () => {
    const fetchImpl = (async () => jsonResponse(validManifest)) as typeof fetch;
    await expect(fetchManifest('/data/manifest.json', fetchImpl)).resolves.toEqual(validManifest);
  });

  it('returns null when the file is missing or the body is invalid', async () => {
    const missing = (async () => jsonResponse(null, false)) as typeof fetch;
    const invalid = (async () => jsonResponse({ bad: true })) as typeof fetch;
    const throwing = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    await expect(fetchManifest('/data/manifest.json', missing)).resolves.toBeNull();
    await expect(fetchManifest('/data/manifest.json', invalid)).resolves.toBeNull();
    await expect(fetchManifest('/data/manifest.json', throwing)).resolves.toBeNull();
  });
});
