import express from 'express';
import type { InitResponse } from '../shared/types/api';
import { createServer, getServerPort } from '@devvit/web/server';
import { getCurrentUsername, isCurrentUserModerator } from './util/auth';
import { getRecordRange, getTotalRecords } from './util/database';
import { handleOnAppInstall } from './handlers/on-app-install';
import { handleOnCommentCreate } from './handlers/on-comment-create';
import { handleOnPostCreate } from './handlers/on-post-create';
import { handleOnModAction } from './handlers/on-mod-action';
import { handleApprove } from './handlers/handle-custom-modqueue-actions';
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

// Approve the corresponding Reddit content, remove it from the stored review queue,
// and archive any related modmail. See handle-custom-modqueue-actions.ts.
router.post('/api/records/:id/approve', handleApprove);

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
