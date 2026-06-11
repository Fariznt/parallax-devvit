import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentData, StoredRecord } from '../util/database.js';

const strings = new Map<string, string>();
const sortedSets = new Map<string, Map<string, number>>();

function normalizeRange(start: number, stop: number, length: number): [number, number] {
  let from = start < 0 ? length + start : start;
  let to = stop < 0 ? length + stop : stop;
  from = Math.max(0, from);
  to = Math.min(length - 1, to);
  return [from, to];
}

vi.mock('@devvit/web/server', () => ({
  redis: {
    set: vi.fn(async (key: string, value: string) => {
      strings.set(key, value);
    }),
    get: vi.fn(async (key: string) => strings.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      strings.delete(key);
    }),
    zAdd: vi.fn(async (key: string, entry: { member: string; score: number }) => {
      if (!sortedSets.has(key)) sortedSets.set(key, new Map());
      sortedSets.get(key)!.set(entry.member, entry.score);
    }),
    zRem: vi.fn(async (key: string, members: string[]) => {
      const set = sortedSets.get(key);
      if (!set) return;
      for (const member of members) set.delete(member);
    }),
    zCard: vi.fn(async (key: string) => sortedSets.get(key)?.size ?? 0),
    zRange: vi.fn(async (key: string, start: number, stop: number) => {
      const set = sortedSets.get(key);
      if (!set) return [];

      const entries = [...set.entries()].sort((a, b) => a[1] - b[1]);
      const [from, to] = normalizeRange(start, stop, entries.length);
      if (from > to) return [];

      return entries.slice(from, to + 1).map(([member, score]) => ({ member, score }));
    }),
  },
}));

const {
  storePostRecord,
  storeCommentRecord,
  getRecord,
  getTotalRecords,
  getRecordRange,
  deleteRecord,
  deleteOldestRecords,
} = await import('../util/database.js');

const INDEX_KEY = 'content-item:index';

const postData: ContentData = {
  title: 'Hello world',
  body: 'Post body',
  imageUrl: 'https://example.com/image.png',
  username: 'poster',
  url: 'https://reddit.com/r/test/comments/abc',
};

const commentData: ContentData = {
  body: 'Comment body',
  username: 'commenter',
  url: 'https://reddit.com/r/test/comments/abc/def',
  parentPostTitle: 'Hello world',
};

function recordKey(id: string): string {
  return `content-item:${id}`;
}

beforeEach(() => {
  strings.clear();
  sortedSets.clear();
});

describe('database', () => {
  it('storePostRecord saves the record and indexes it', async () => {
    const record = await storePostRecord('t3_post1', postData, 1000);

    expect(record).toEqual({
      id: 't3_post1',
      kind: 'post',
      sortAt: 1000,
      data: postData,
    });
    expect(JSON.parse(strings.get(recordKey('t3_post1'))!)).toEqual(record);
    expect(sortedSets.get(INDEX_KEY)?.get('t3_post1')).toBe(1000);
  });

  it('storeCommentRecord saves the record and indexes it', async () => {
    const record = await storeCommentRecord('t1_comment1', commentData, 2000);

    expect(record.kind).toBe('comment');
    expect(record.data.parentPostTitle).toBe('Hello world');
    expect(sortedSets.get(INDEX_KEY)?.get('t1_comment1')).toBe(2000);
  });

  it('storeRecord rolls back when indexing fails', async () => {
    const { redis } = await import('@devvit/web/server');
    vi.mocked(redis.zAdd).mockRejectedValueOnce(new Error('quota exceeded'));

    await expect(storePostRecord('t3_fail', postData)).rejects.toThrow('quota exceeded');
    expect(strings.has(recordKey('t3_fail'))).toBe(false);
  });

  it('getRecord returns a stored record or null', async () => {
    await storePostRecord('t3_post1', postData, 1000);

    expect(await getRecord('t3_post1')).toMatchObject({ id: 't3_post1', kind: 'post' });
    expect(await getRecord('missing')).toBeNull();
  });

  it('getTotalRecords returns the index size', async () => {
    expect(await getTotalRecords()).toBe(0);

    await storePostRecord('t3_post1', postData, 1000);
    await storeCommentRecord('t1_comment1', commentData, 2000);

    expect(await getTotalRecords()).toBe(2);
  });

  it('getRecordRange returns newest-first slices', async () => {
    await storePostRecord('t3_old', postData, 1000);
    await storeCommentRecord('t1_mid', commentData, 2000);
    await storePostRecord('t3_new', postData, 3000);

    expect(await getRecordRange(0, 0)).toEqual([
      expect.objectContaining({ id: 't3_new' }),
    ]);
    expect((await getRecordRange(0, 2)).map((record) => record.id)).toEqual([
      't3_new',
      't1_mid',
      't3_old',
    ]);
  });

  it('getRecordRange clamps oversized bounds instead of failing', async () => {
    await storePostRecord('t3_only', postData, 1000);

    const records = await getRecordRange(0, 999);
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe('t3_only');
  });

  it('getRecordRange returns empty results for invalid ranges', async () => {
    await storePostRecord('t3_post1', postData, 1000);

    expect(await getRecordRange(5, 10)).toEqual([]);
    expect(await getRecordRange(2, 1)).toEqual([]);
  });

  it('deleteRecord removes the record and index entry', async () => {
    await storePostRecord('t3_post1', postData, 1000);

    await deleteRecord('t3_post1');

    expect(await getRecord('t3_post1')).toBeNull();
    expect(sortedSets.get(INDEX_KEY)?.has('t3_post1')).toBeFalsy();
  });

  it('deleteOldestRecords removes the oldest indexed records', async () => {
    await storePostRecord('t3_old', postData, 1000);
    await storeCommentRecord('t1_mid', commentData, 2000);
    await storePostRecord('t3_new', postData, 3000);

    const deleted = await deleteOldestRecords(2);

    expect(deleted).toBe(2);
    expect(await getTotalRecords()).toBe(1);
    expect(await getRecord('t3_old')).toBeNull();
    expect(await getRecord('t1_mid')).toBeNull();
    expect(await getRecord('t3_new')).not.toBeNull();
  });

  it('deleteOldestRecords clamps oversized counts', async () => {
    await storePostRecord('t3_only', postData, 1000);

    const deleted = await deleteOldestRecords(999);

    expect(deleted).toBe(1);
    expect(await getTotalRecords()).toBe(0);
  });

  it('deleteOldestRecords returns 0 for non-positive counts', async () => {
    await storePostRecord('t3_post1', postData, 1000);

    expect(await deleteOldestRecords(0)).toBe(0);
    expect(await getTotalRecords()).toBe(1);
  });
});
