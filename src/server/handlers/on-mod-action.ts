import type { Request, Response } from 'express';
import type { OnModActionRequest, TriggerResponse } from '@devvit/web/shared';
import { deleteRecord } from '../util/database';

const HANDLED_ACTIONS = new Set([
  'approvelink',    // post approved
  'approvecomment', // comment approved
  'removelink',     // post removed
  'removecomment',  // comment removed
  'spamlink',       // post marked as spam (also a removal)
  'spamcomment',    // comment marked as spam (also a removal)
]);

/**
 * Devvit Web trigger: onModAction -> /internal/on-mod-action
 *
 * When a moderator approves or removes a post/comment outside of this app's UI
 * (e.g. via native Reddit mod tools), the item has been actioned and should be
 * removed from the pending queue.
 */
export async function handleOnModAction(
  req: Request<Record<string, never>, TriggerResponse, OnModActionRequest>,
  res: Response<TriggerResponse>
): Promise<void> {
  console.log('[handleOnModAction] handling mod action event');
  const { action, targetPost, targetComment } = req.body;
  
  const isPostAction = action === 'approvelink' || action === 'removelink' || action === 'spamlink';

  if (!HANDLED_ACTIONS.has(action ?? '')) {
    res.status(200).json({});
    return;
  }

  const id = (isPostAction ? targetPost?.id : targetComment?.id) ?? null;

  if (!id) {
    console.warn(`[onModAction] missing target ID for action="${action}"`);
    res.status(200).json({});
    return;
  }

  try {
    await deleteRecord(id);
    res.status(200).json({});
  } catch (error) {
    console.error('[onModAction] failed to delete record', error);
    res.status(500).json({});
  }
}
