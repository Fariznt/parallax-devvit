import type { Request, Response } from 'express';
import type { OnModActionRequest, TriggerResponse } from '@devvit/web/shared';
import { deleteRecord } from '../util/database';
import { reddit, context, settings } from '@devvit/web/server';

const AUTOMATION_BOTS = new Set(['AutoModerator', 'policy-agent']);

const HANDLED_ACTIONS = new Set([
  'approvelink',    // post approved
  'approvecomment', // comment approved
  'removelink',     // post removed
  'removecomment',  // comment removed
  // 'spamlink',       // post marked as spam (also a removal)
  // 'spamcomment',    // comment marked as spam (also a removal)
]);

async function archiveRelatedModmails(bareId: string): Promise<void> {
  console.log(`[archiveRelatedModmails] scanning modmail for content id: ${bareId}`);
  let after: string | undefined;
  let page = 0;

  while (true) {
    page++;
    const { conversations, conversationIds } = await reddit.modMail.getConversations({
      subreddits: [context.subredditName],
      state: 'all',
      limit: 100,
      ...(after ? { after } : {}),
    });
    console.log(`[archiveRelatedModmails] page ${page}: ${conversationIds.length} conversations`);

    for (const id of conversationIds) {
      const conv = conversations[id];
      if (!conv) {
        console.warn(`[archiveRelatedModmails] conversation ${id} missing from response map, skipping`);
        continue;
      }
      const hasMatchingBotMessage = Object.values(conv.messages).some(
        (m) => AUTOMATION_BOTS.has(m.author?.name ?? '') && m.body?.includes(bareId)
      );
      if (hasMatchingBotMessage) {
        console.log(`[archiveRelatedModmails] archiving conversation ${id} (subject: "${conv.subject}")`);
        const archiveResult = await reddit.modMail.archiveConversation(id);
        console.log(`[archiveRelatedModmails] archiveConversation(${id}) result:`, JSON.stringify(archiveResult, null, 2));
      }
    }

    if (conversationIds.length < 100) break;
    after = conversationIds[conversationIds.length - 1];
  }

  console.log(`[archiveRelatedModmails] done (${page} page(s) scanned)`);
}

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


    const bareId = id.replace(/^t[13]_/, '');
    const remMailOnApprove = await settings.get<boolean>('remMailOnApprove');
    if (remMailOnApprove) {
      try {
        console.log(`[onModAction] archiving related modmails for ${bareId}`);
        await archiveRelatedModmails(bareId);
        console.log(`[onModAction] archived related modmails for ${bareId} successfully`);
      } catch (error) {
        console.error('[onModAction] failed to archive related modmails', error);
      }
    }

    res.status(200).json({});
  } catch (error) {
    console.error('[onModAction] failed to delete record', error);
    res.status(500).json({});
  }
}
