import type { Request, Response } from 'express';
import type { OnCommentCreateRequest, TriggerResponse } from '@devvit/web/shared';
import type { ContentData } from '../util/database';
import { storeCommentRecord } from '../util/database';
import { normalizeTimestamp, toRedditUrl } from '../util/util';

/**
 * Devvit Web trigger: onCommentCreate -> /internal/on-comment-create
 * Policy evaluation today: src/service/main.ts (blocks). Migrate here later.
 */
export async function handleOnCommentCreate(
  req: Request<Record<string, never>, TriggerResponse, OnCommentCreateRequest>,
  res: Response<TriggerResponse>
): Promise<void> {
  const { author, comment, post } = req.body;

  if (!comment) {
    console.warn('onCommentCreate fired without a comment payload');
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

    await storeCommentRecord(
      comment.id,
      data,
      normalizeTimestamp(comment.createdAt)
    );

    res.status(200).json({});
  } catch (error) {
    console.error('Unable to store in comment create event', error);
    res.status(500).json({});
  }
}