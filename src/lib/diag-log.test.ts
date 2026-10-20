import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  appendDiagEntry, clearDiag, diag, flushDiag, getDiagEntries, sanitize, trimEntries,
  DIAG_MAX_BYTES, DIAG_MAX_ENTRIES, DIAG_STORAGE_KEY, type DiagEntry,
} from './diag-log';
import { MessageType } from './message-types';
import { DIAG_LOG_MESSAGE_TYPE } from '../content/diag';

function installChromeMock() {
  const store: Record<string, unknown> = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in store ? { [key]: structuredClone(store[key]) } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => {
          // yield so interleaving would expose races
          await Promise.resolve();
          Object.assign(store, structuredClone(items));
        }),
        remove: vi.fn(async (key: string) => { delete store[key]; }),
      },
    },
  });
  return store;
}

let store: Record<string, unknown>;
beforeEach(async () => {
  store = installChromeMock();
  await clearDiag();
});

describe('sanitize', () => {
  it('drops sensitive keys case-insensitively and keeps the rest', () => {
    const out = sanitize({
      Title: 'Secret meeting', summary: 's', description: 'd', location: 'l', attendees: ['a@b.c'],
      access_token: 't', idToken: 'i', Authorization: 'Bearer x', refresh_token: 'r', password: 'p', cookie: 'c',
      eventId: 'abc', count: 3, ok: true,
    });
    expect(out).toEqual({ eventId: 'abc', count: 3, ok: true });
  });

  it('caps strings, depth and array length, and scrubs token-looking strings', () => {
    const out = sanitize({
      long: 'x'.repeat(500),
      arr: Array.from({ length: 50 }, (_, i) => i),
      deep: { a: { b: { c: { d: { e: 1 } } } } },
      tok: 'failed with ya29.a0AfH6SMBabcdefghijklmnop',
    })!;
    expect((out.long as string).length).toBe(201);
    expect((out.arr as unknown[]).length).toBe(21);
    expect(JSON.stringify(out.deep)).toContain('[max-depth]');
    expect(out.tok).not.toContain('ya29.a0');
  });

  it('serializes Errors and returns undefined for empty input', () => {
    expect(sanitize({ e: new Error('boom') })).toEqual({ e: { name: 'Error', message: 'boom' } });
    expect(sanitize(undefined)).toBeUndefined();
    expect(sanitize({ title: 'only secret' })).toBeUndefined();
  });
});

describe('ring buffer', () => {
  const mk = (i: number, size = 10): DiagEntry => ({ t: i, ctx: 'sw', cat: 'sync', level: 'info', msg: 'x'.repeat(size) });

  it('keeps only the newest 1000 entries', () => {
    const entries = Array.from({ length: DIAG_MAX_ENTRIES + 50 }, (_, i) => mk(i));
    const out = trimEntries(entries);
    expect(out).toHaveLength(DIAG_MAX_ENTRIES);
    expect(out[0].t).toBe(50);
  });

  it('drops oldest entries to stay under the byte cap', () => {
    const entries = Array.from({ length: 900 }, (_, i) => mk(i, 400));
    const out = trimEntries(entries);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(DIAG_MAX_BYTES);
    expect(out.length).toBeLessThan(900);
    expect(out[out.length - 1].t).toBe(899);
  });
});

describe('writer', () => {
  it('persists concurrent appends in call order with none lost', async () => {
    for (let i = 0; i < 25; i++) diag('sync', 'info', `m${i}`);
    await Promise.all([
      appendDiagEntry('panel', 'ui', 'info', 'p1'),
      appendDiagEntry('content', 'drag', 'warn', 'c1'),
    ]);
    const msgs = (await getDiagEntries()).map((e) => e.msg);
    expect(msgs).toEqual([...Array.from({ length: 25 }, (_, i) => `m${i}`), 'p1', 'c1']);
  });

  it('stamps ctx, time and sanitises data and msg at write time', async () => {
    await appendDiagEntry('content', 'select', 'warn', 'm'.repeat(1000), { eventId: 'e', title: 'Private', token: 't' });
    const [e] = await getDiagEntries();
    expect(e).toMatchObject({ ctx: 'content', cat: 'select', level: 'warn', data: { eventId: 'e' } });
    expect(e.msg.length).toBe(301);
    expect(typeof e.t).toBe('number');
    expect(JSON.stringify(store[DIAG_STORAGE_KEY])).not.toMatch(/Private/);
  });

  it('clear wipes stored and unflushed entries', async () => {
    diag('sync', 'info', 'a');
    await flushDiag();
    diag('sync', 'info', 'b');
    await clearDiag();
    expect(await getDiagEntries()).toEqual([]);
  });
});

describe('content sender constant', () => {
  it('matches MessageType.DIAG_LOG', () => {
    expect(DIAG_LOG_MESSAGE_TYPE).toBe(MessageType.DIAG_LOG);
  });
});
