import type { Request, Response } from 'express';
import type { OnCommentCreateRequest, TriggerResponse } from '@devvit/web/shared';
import type { ContentData } from '../util/database';
import { deleteOldestRecords, isRedisQuotaError, storeCommentRecord } from '../util/database';
import { normalizeTimestamp, toRedditUrl } from '../util/util';
import { context } from '@devvit/web/server';

const STORE_RETRY_ATTEMPTS = 3;
const EVIC_RECORDS_COUNT = 10;

/**
 * Devvit Web trigger: onCommentCreate -> /internal/on-comment-create
 * Policy evaluation today: src/service/main.ts (blocks). Migrate here later.
 */
export async function handleOnCommentCreate(
  req: Request<Record<string, never>, TriggerResponse, OnCommentCreateRequest>,
  res: Response<TriggerResponse>
): Promise<void> {
  console.log('[handleOnCommentCreate] handling comment create event');
  const { author, comment, post } = req.body;

  if (!comment) {
    console.warn('onCommentCreate fired without a comment payload');
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
      body: comment.body,
      url: toRedditUrl(comment.permalink),
      username: author?.name ?? comment.author ?? 'unknown user',
    };
    if (post?.title) data.parentPostTitle = post.title;

    const sortAt = normalizeTimestamp(comment.createdAt);
    for (let attempt = 0; attempt < STORE_RETRY_ATTEMPTS; attempt++) {
      try {
        await storeCommentRecord(comment.id, data, sortAt);
        break;
      } catch (error) {
        if (!isRedisQuotaError(error) || attempt === STORE_RETRY_ATTEMPTS - 1) throw error;
        if ((await deleteOldestRecords(EVIC_RECORDS_COUNT)) === 0) throw error;
      }
    }

    res.status(200).json({});
  } catch (error) {
    console.error('Unable to store in comment create event', error);
    res.status(500).json({});
  }
}