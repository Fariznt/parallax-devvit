import type { Request, Response } from 'express';
import type { OnCommentCreateRequest, TriggerResponse } from '@devvit/web/shared';

/**
 * Devvit Web trigger: onCommentCreate -> /internal/on-comment-create
 * Policy evaluation today: src/service/main.ts (blocks). Migrate here later.
 */
export async function handleOnCommentCreate(
  _req: Request<Record<string, never>, TriggerResponse, OnCommentCreateRequest>,
  res: Response<TriggerResponse>
): Promise<void> {
  res.status(200).json({ status: 'ok' });
}
