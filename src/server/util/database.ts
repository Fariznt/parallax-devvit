import { redis } from '@devvit/web/server';

export type ContentKind = 'post' | 'comment';

export type ContentData = {
  body: string;
  username: string;
  url: string;
  // for posts only
  title?: string; 
  imageUrl?: string | null;
  // for comments only
  parentPostTitle?: string;
};

export type StoredRecord = {
  id: string;
  kind: ContentKind;
  sortAt: number;
  data: ContentData;
};

const RECORD_KEY_PREFIX = 'content-item';
const RECORD_INDEX_KEY = `${RECORD_KEY_PREFIX}:index`;

/** Checks if the error is a Redis quota error, which would warrant eviction of old records */
export function isRedisQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /quota|limit|storage|full|exceeded/i.test(message);
}

/** Stores a record and indexes its id by timestamp. */
async function storeRecord(
  kind: ContentKind,
  id: string,
  data: ContentData,
  sortAt: number = Date.now()
): Promise<StoredRecord> {
  const record: StoredRecord = { id, kind, sortAt, data };

  const redisKey = `${RECORD_KEY_PREFIX}:${id}`;

  // Store the full record separately so the sorted set stays small.
  await redis.set(redisKey, JSON.stringify(record));

  try {
    await redis.zAdd(RECORD_INDEX_KEY, { member: id, score: sortAt });
  } catch (error) {
    // Avoid leaving an unindexed record behind if indexing fails.
    await redis.del(redisKey);
    throw error;
  }

  return record;
}

/** Stores a post and adds it to the shared ordered index. */
export async function storePostRecord(
  id: string,
  data: ContentData,
  sortAt: number = Date.now()
): Promise<StoredRecord> {
  return storeRecord('post', id, data, sortAt);
}

/** Stores a comment and adds it to the shared ordered index. */
export async function storeCommentRecord(
  id: string,
  data: ContentData,
  sortAt: number = Date.now()
): Promise<StoredRecord> {
  return storeRecord('comment', id, data, sortAt);
}

/** Retrieves records by id, skipping any missing records. */
async function getRecordsById(ids: string[]): Promise<StoredRecord[]> {
  const records = await Promise.all(
    ids.map(async (recordId) => {
      const raw = await redis.get(`${RECORD_KEY_PREFIX}:${recordId}`);
      return raw ? (JSON.parse(raw) as StoredRecord) : null;
    })
  );

  // (Missing records are possible if a previous write/delete only partially completed.)
  return records.filter((record): record is StoredRecord => record !== null);
}

/** Deletes a record and removes its id from the ordered index. */
export async function deleteRecord(id: string): Promise<void> {
  await Promise.all([
    redis.del(`${RECORD_KEY_PREFIX}:${id}`),
    redis.zRem(RECORD_INDEX_KEY, [id]),
  ]);
}

/** Deletes up to count records from the beginning of the ordered index. */
export async function deleteOldestRecords(count: number): Promise<number> {
  if (count <= 0) return 0;

  const totalRecords = await redis.zCard(RECORD_INDEX_KEY);
  const boundedCount = Number.isFinite(count) ? Math.min(Math.floor(count), totalRecords) : totalRecords;

  const indexRefs = await redis.zRange(RECORD_INDEX_KEY, 0, boundedCount - 1);
  const ids = indexRefs.map((ref) => ref.member);

  // Delete via the shared helper so records and index entries stay in sync.
  await Promise.all(ids.map((recordId) => deleteRecord(recordId)));

  return ids.length;
}

/** Retrieves one stored record by id. */
export async function getRecord(id: string): Promise<StoredRecord | null> {
  const raw = await redis.get(`${RECORD_KEY_PREFIX}:${id}`);
  return raw ? (JSON.parse(raw) as StoredRecord) : null;
}

/** Returns the total number of stored post/comment records. */
export async function getTotalRecords(): Promise<number> {
  return redis.zCard(RECORD_INDEX_KEY);
}

/** Retrieves stored records by newest-first rank, inclusive of from and to. */
export async function getRecordRange(from: number, to: number): Promise<StoredRecord[]> {
  const totalRecords = await getTotalRecords();
  if (totalRecords === 0) return [];

  const boundedFrom = Number.isFinite(from) ? Math.max(Math.floor(from), 0) : 0;
  const boundedTo = Number.isFinite(to) ? Math.min(Math.floor(to), totalRecords - 1) : totalRecords - 1;
  if (boundedFrom > boundedTo) return [];

  const newestRank = totalRecords - 1;
  const indexRefs = await redis.zRange(
    RECORD_INDEX_KEY,
    newestRank - boundedTo,
    newestRank - boundedFrom
  );
  const ids = indexRefs.map((ref) => ref.member).reverse();

  return getRecordsById(ids);
}
