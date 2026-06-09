import type { Request, Response } from 'express';
import { context, reddit, redis } from '@devvit/web/server';
import type { MenuItemRequest, TriggerResponse, UiResponse } from '@devvit/web/shared';

const MODERATION_WEBVIEW_POST_URL_KEY = 'Moderation Webview Key';

function getPostUrl(postId: string): string {
  return `https://reddit.com/r/${context.subredditName}/comments/${postId}`;
}

/** Devvit Web menu action -> /internal/menu/post-create */
export async function handleMenuPostCreate(
  _req: Request<Record<string, never>, UiResponse | TriggerResponse, MenuItemRequest>,
  res: Response<UiResponse | TriggerResponse>
): Promise<void> {
  try {
    const existingPostUrl = await redis.get(MODERATION_WEBVIEW_POST_URL_KEY);

    if (existingPostUrl) {
      res.status(200).json({ navigateTo: existingPostUrl });
      return;
    }

    const post = await reddit.submitCustomPost({
      title: 'Policy Agent Moderation Webview',
    });
    const postUrl = getPostUrl(post.id);

    await redis.set(MODERATION_WEBVIEW_POST_URL_KEY, postUrl);

    res.status(200).json({ navigateTo: postUrl });
  } catch (error) {
    const errorMsg = `Error: Contact a developer at parallax.moderator@gmail.com.`;
    console.error(errorMsg);
    res.status(200).json({ showToast: errorMsg });
  }
}
