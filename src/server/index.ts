import express from 'express';
import type { InitResponse } from '../shared/types/api';
import { createServer, getServerPort, reddit } from '@devvit/web/server';
import { getCurrentUsername, isCurrentUserModerator } from './util/auth';
import { deleteRecord, getRecord, getRecordRange, getTotalRecords } from './util/database';
import type { StoredRecord } from './util/database';
import { handleOnAppInstall } from './handlers/on-app-install';
import { handleOnCommentCreate } from './handlers/on-comment-create';
import { handleOnPostCreate } from './handlers/on-post-create';
import { handleOnModAction } from './handlers/on-mod-action';
import { handleMenuPostCreate } from './handlers/menu-post-create';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

const router = express.Router();

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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

// Returns the current user's username and moderator status --- used by client to display the correct UI.
router.get('/api/init', async (_req, res): Promise<void> => {
  const username = await getCurrentUsername();

  const body: InitResponse = {
    username,
    isModerator: (await isCurrentUserModerator()) === true,
  };
  res.json(body);
});

// Fetch a newest-first page of stored records.
router.get('/api/records', async (req, res): Promise<void> => {
  if (!(await isCurrentUserModerator())) {
    res.status(403).json({ error: 'Moderator access required' });
    return;
  }

  const from = parseNumber(req.query.from);
  const to = parseNumber(req.query.to);
  if (from === null || to === null) {
    res.status(400).json({ error: 'from and to query params are required numbers' });
    return;
  }

  try {
    res.json({ records: await getRecordRange(from, to) });
  } catch (error) {
    console.error('Unable to get record range', error);
    res.status(500).json({ error: 'Unable to get record range' });
  }
});

// Fetch the total stored record count.
router.get('/api/records/total', async (_req, res): Promise<void> => {
  if (!(await isCurrentUserModerator())) {
    res.status(403).json({ error: 'Moderator access required' });
    return;
  }

  try {
    res.json({ totalRecords: await getTotalRecords() });
  } catch (error) {
    console.error('Unable to get total records', error);
    res.status(500).json({ error: 'Unable to get total records' });
  }
});

// Approve the corresponding Reddit content, then remove it from the stored review queue.
router.post('/api/records/:id/approve', async (req, res): Promise<void> => {
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

    await reddit.approve(approvalId);
    await deleteRecord(record.id);

    res.json({ approvedRecordId: record.id, deletedRecordId: record.id });
  } catch (error) {
    console.error('Unable to approve and delete record', error);
    res.status(500).json({ error: 'Unable to approve and delete record' });
  }
});

// Internal routes --- wired from devvit.json (triggers, menu). Not called via client fetch.
// These run based on events triggered in Reddit, outside of our webview client
router.post('/internal/on-comment-create', handleOnCommentCreate);
router.post('/internal/on-post-create', handleOnPostCreate);
router.post('/internal/on-mod-action', handleOnModAction);
router.post('/internal/on-app-install', handleOnAppInstall);
router.post('/internal/menu/post-create', handleMenuPostCreate);

app.use(router);

const port = getServerPort();
const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
