import type { Request, Response } from 'express';
import type { OnPostCreateRequest, TriggerResponse } from '@devvit/web/shared';
import type { ContentData } from '../util/database';
import { deleteOldestRecords, isRedisQuotaError, storePostRecord } from '../util/database';
import { normalizeTimestamp, toRedditUrl } from '../util/util';
import { context } from '@devvit/server'; // temporary import for testing

const STORE_RETRY_ATTEMPTS = 3;
const EVIC_RECORDS_COUNT = 10;

/**
 * Devvit Web trigger: onPostCreate -> /internal/on-post-create
 * Policy evaluation today: src/service/main.ts (blocks). Migrate here later.
 */
export async function handleOnPostCreate(
  req: Request<Record<string, never>, TriggerResponse, OnPostCreateRequest>,
  res: Response<TriggerResponse>
): Promise<void> {
  console.log('[handleOnPostCreate] handling post create event');
  const { author, post } = req.body;

  if (!post) {
    console.warn('onPostCreate fired without a post payload');
    res.status(200).json({});
    return;
  }
  
  // Skip processing for mod team
  if (author?.name === context.subredditName + "-ModTeam" 
    || author?.name === "policy-agent") {
      res.status(200).json({});
      return;
    }

  try {
    const data: ContentData = {
      body: post.selftext,
      title: post.title,
      url: toRedditUrl(post.permalink || post.url),
      username: author?.name ?? 'unknown user',
    };

    data.imageUrl = post.url ?? null;

    const sortAt = normalizeTimestamp(post.createdAt);
    console.log(`[onPostCreate] storing post id="${post.id}" permalink="${post.permalink}"`);
    for (let attempt = 0; attempt < STORE_RETRY_ATTEMPTS; attempt++) {
      try {
        await storePostRecord(post.id, data, sortAt);
        break;
      } catch (error) {
        if (!isRedisQuotaError(error) || attempt === STORE_RETRY_ATTEMPTS - 1) throw error;
        if ((await deleteOldestRecords(EVIC_RECORDS_COUNT)) === 0) throw error;
      }
    }

    res.status(200).json({});
  } catch (error) {
    console.error('Unable to store in post create event', error);
    res.status(500).json({});
  }
}
