import type { Request, Response } from 'express';
import type { OnPostCreateRequest, TriggerResponse } from '@devvit/web/shared';
import type { ContentData } from '../util/database';
import { storePostRecord } from '../util/database';
import { normalizeTimestamp, toRedditUrl } from '../util/util';

function getPostImageUrl(post: OnPostCreateRequest['post']): string | undefined {
  return post?.mediaUrls?.[0] ?? post?.media?.oembed?.thumbnailUrl ?? undefined;
}

/**
 * Devvit Web trigger: onPostCreate -> /internal/on-post-create
 * Policy evaluation today: src/service/main.ts (blocks). Migrate here later.
 */
export async function handleOnPostCreate(
  req: Request<Record<string, never>, TriggerResponse, OnPostCreateRequest>,
  res: Response<TriggerResponse>
): Promise<void> {
  const { author, post } = req.body;

  if (!post) {
    console.warn('onPostCreate fired without a post payload');
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
    const imageUrl = getPostImageUrl(post);
    if (imageUrl) data.imageUrl = imageUrl;

    await storePostRecord(
      post.id,
      data,
      normalizeTimestamp(post.createdAt)
    );

    res.status(200).json({});
  } catch (error) {
    console.error('Unable to store in post create event', error);
    res.status(500).json({});
  }
}
