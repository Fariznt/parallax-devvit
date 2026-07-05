import type { Request, Response } from 'express';
import { context, reddit, settings } from '@devvit/web/server';
import { deleteRecord, getRecord } from '../util/database';
import type { StoredRecord } from '../util/database';
import { isCurrentUserModerator } from '../util/auth';
import { AUTOMATION_BOTS } from './on-mod-action';

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function getApprovalId(record: StoredRecord): `t1_${string}` | `t3_${string}` | null {
  if (record.id.startsWith('t1_') || record.id.startsWith('t3_')) {
    if (record.kind === 'comment' && record.id.startsWith('t1_')) return record.id as `t1_${string}`;
    if (record.kind === 'post' && record.id.startsWith('t3_')) return record.id as `t3_${string}`;
    return null;
  }

  return record.kind === 'comment' ? `t1_${record.id}` : `t3_${record.id}`;
}

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
 * POST /api/records/:id/approve
 *
 * Approves the corresponding Reddit content and removes it from the stored
 * review queue, mirroring what handleOnModAction does for native mod actions.
 *
 * Unlike handleOnModAction, this also archives any related modmail thread the
 * bot filed about the content -- a mod approving via the custom webview is a
 * real, intentional decision (same as approving natively)
 */
export async function handleApprove(req: Request, res: Response): Promise<void> {
  if (!(await isCurrentUserModerator())) {
    res.status(403).json({ error: 'Moderator access required' });
    return;
  }

  const id = parseString(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'id path param is required and must be a non-empty string' });
    return;
  }

  try {
    const record = await getRecord(id);
    if (!record) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }

    const approvalId = getApprovalId(record);
    if (!approvalId) {
      res.status(500).json({ error: 'Stored record id does not match its content kind' });
      return;
    }

    await reddit.approve(approvalId); // approve the content
    await deleteRecord(record.id); // delete the record from our internal database of posts/comments
    console.log(`[handleApprove] deleted record ${record.id} successfully`);

    // archive related modmails if applicable
    const bareId = record.id.replace(/^t[13]_/, '');
    const remMailOnApprove = await settings.get<boolean>('remMailOnApprove');
    if (remMailOnApprove) {
      try {
        console.log(`[handleApprove] archiving related modmails for ${bareId}`);
        await archiveRelatedModmails(bareId);
        console.log(`[handleApprove] archived related modmails for ${bareId} successfully`);
      } catch (error) {
        console.error('[handleApprove] failed to archive related modmails', error);
      }
    }

    res.json({ approvedRecordId: record.id, deletedRecordId: record.id });
  } catch (error) {
    console.error('Unable to approve and delete record', error);
    res.status(500).json({ error: 'Unable to approve and delete record' });
  }
}
