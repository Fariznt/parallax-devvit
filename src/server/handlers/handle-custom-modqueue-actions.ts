import type { Request, Response } from 'express';
import { context, reddit, settings } from '@devvit/web/server';
import { deleteAllRecords, deleteRecord, getRecord } from '../util/database';
import type { StoredRecord } from '../util/database';
import { isCurrentUserModerator } from '../util/auth';
import { AUTOMATION_BOTS } from './on-mod-action';

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function getThingId(record: StoredRecord): `t1_${string}` | `t3_${string}` | null {
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

async function maybeArchiveRelatedModmails(recordId: string, logPrefix: string): Promise<void> {
  const remMailOnApproveRemove = await settings.get<boolean>('remMailOnApproveRemove');
  if (!remMailOnApproveRemove) return;

  const bareId = recordId.replace(/^t[13]_/, '');
  try {
    console.log(`[${logPrefix}] archiving related modmails for ${bareId}`);
    await archiveRelatedModmails(bareId);
    console.log(`[${logPrefix}] archived related modmails for ${bareId} successfully`);
  } catch (error) {
    console.error(`[${logPrefix}] failed to archive related modmails`, error);
  }
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

    const thingId = getThingId(record);
    if (!thingId) {
      res.status(500).json({ error: 'Stored record id does not match its content kind' });
      return;
    }

    await reddit.approve(thingId);
    await deleteRecord(record.id);
    console.log(`[handleApprove] deleted record ${record.id} successfully`);

    await maybeArchiveRelatedModmails(record.id, 'handleApprove');

    res.json({ approvedRecordId: record.id, deletedRecordId: record.id });
  } catch (error) {
    console.error('Unable to approve and delete record', error);
    res.status(500).json({ error: 'Unable to approve and delete record' });
  }
}

/**
 * POST /api/records/:id/dismiss
 *
 * Removes an item from the custom review queue only — does not approve/remove
 * the Reddit content, and does not archive related modmail.
 */
export async function handleDismiss(req: Request, res: Response): Promise<void> {
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

    await deleteRecord(record.id);
    console.log(`[handleDismiss] deleted record ${record.id} successfully`);

    res.json({ dismissedRecordId: record.id, deletedRecordId: record.id });
  } catch (error) {
    console.error('Unable to dismiss record', error);
    res.status(500).json({ error: 'Unable to dismiss record' });
  }
}

/**
 * POST /api/records/:id/remove
 *
 * Removes the corresponding Reddit content and deletes it from the stored
 * review queue. Archives related modmail when remMailOnApproveRemove is on.
 */
export async function handleRemove(req: Request, res: Response): Promise<void> {
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

    const thingId = getThingId(record);
    if (!thingId) {
      res.status(500).json({ error: 'Stored record id does not match its content kind' });
      return;
    }

    await reddit.remove(thingId, false);
    await deleteRecord(record.id);
    console.log(`[handleRemove] deleted record ${record.id} successfully`);

    await maybeArchiveRelatedModmails(record.id, 'handleRemove');

    res.json({ removedRecordId: record.id, deletedRecordId: record.id });
  } catch (error) {
    console.error('Unable to remove and delete record', error);
    res.status(500).json({ error: 'Unable to remove and delete record' });
  }
}

/**
 * POST /api/records/clear
 *
 * Clears the entire custom review queue. Does not touch Reddit content or
 * related modmail threads.
 */
export async function handleClearAll(_req: Request, res: Response): Promise<void> {
  if (!(await isCurrentUserModerator())) {
    res.status(403).json({ error: 'Moderator access required' });
    return;
  }

  try {
    const deletedCount = await deleteAllRecords();
    console.log(`[handleClearAll] deleted ${deletedCount} record(s) successfully`);
    res.json({ deletedCount });
  } catch (error) {
    console.error('Unable to clear records', error);
    res.status(500).json({ error: 'Unable to clear records' });
  }
}
