import type { Request, Response } from 'express';
import type { MenuItemRequest, TriggerResponse } from '@devvit/web/shared';

/** Devvit Web menu action → /internal/menu/post-create */
export async function handleMenuPostCreate(
  _req: Request<Record<string, never>, TriggerResponse, MenuItemRequest>,
  res: Response<TriggerResponse>
): Promise<void> {
  res.status(200).json({ status: 'ok' });
}
