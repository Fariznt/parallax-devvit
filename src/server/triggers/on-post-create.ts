import type { Request, Response } from 'express';
import type { OnPostCreateRequest, TriggerResponse } from '@devvit/web/shared';

/**
 * Devvit Web trigger: onPostCreate → /internal/on-post-create
 * Policy evaluation today: src/service/main.ts (blocks). Migrate here later.
 */
export async function handleOnPostCreate(
  _req: Request<Record<string, never>, TriggerResponse, OnPostCreateRequest>,
  res: Response<TriggerResponse>
): Promise<void> {
  res.status(200).json({ status: 'ok' });
}
