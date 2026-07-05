import type { Request, Response } from 'express';
import type { OnModActionRequest, TriggerResponse } from '@devvit/web/shared';
import { deleteRecord } from '../util/database';

/** Usernames whose mod actions are this app's own automation, not a real mod decision. */
export const AUTOMATION_BOTS = new Set(['AutoModerator', 'policy-agent']);

const HANDLED_ACTIONS = new Set([
  'approvelink',    // post approved
  'approvecomment', // comment approved
  'removelink',     // post removed
  'removecomment',  // comment removed
  // 'spamlink',       // post marked as spam (also a removal)
  // 'spamcomment',    // comment marked as spam (also a removal)
]);

/**
 * Devvit Web trigger: onModAction -> /internal/on-mod-action
 *
 * When a real moderator approves or removes a post/comment outside of this app's UI
 * (e.g. via native Reddit mod tools), the item has been actioned and should be
 * removed from the pending queue.
 *
 * Actions taken by this app's own automation (the policy engine's automatic
 * removals) are ignored entirely here, so they don't pull items out of the
 * custom modqueue webview. The webview's own approve flow
 * (handle-custom-modqueue-actions.ts) is responsible for its own queue/modmail
 * cleanup instead.
 */
export async function handleOnModAction(
  req: Request<Record<string, never>, TriggerResponse, OnModActionRequest>,
  res: Response<TriggerResponse>
): Promise<void> {
  console.log('[handleOnModAction] handling mod action event');
  const { action, targetPost, targetComment, moderator } = req.body;

  if (moderator?.name && AUTOMATION_BOTS.has(moderator.name)) {
    console.log(`[onModAction] action="${action}" performed by PolicyAgent automation (${moderator.name}), ignoring`);
    res.status(200).json({});
    return;
  }

  const isPostAction = action === 'approvelink' || action === 'removelink' //|| action === 'spamlink';

  if (!HANDLED_ACTIONS.has(action ?? '')) {
    console.log(`[onModAction] action="${action}" not handled`);
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
    console.log(`[onModAction] deleted record ${id} successfully`);

    res.status(200).json({});
  } catch (error) {
    console.error('[onModAction] failed to delete record', error);
    res.status(500).json({});
  }
}
