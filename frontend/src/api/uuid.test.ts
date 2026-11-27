import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuidV4 } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidV4', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('works without crypto.randomUUID, as on a plain HTTP page', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    expect('randomUUID' in globalThis.crypto).toBe(false);

    const keys = new Set(Array.from({ length: 200 }, () => uuidV4()));
    expect(keys.size).toBe(200);
    for (const key of keys) expect(key).toMatch(V4);
  });

  it('sets the version and variant bits from the random bytes', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => array.fill(0xff),
    });
    expect(uuidV4()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
