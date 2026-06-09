import express from 'express';
import type { InitResponse } from '../shared/types/api';
import { createServer, getServerPort } from '@devvit/web/server';
import { getCurrentUsername, isCurrentUserModerator } from './auth';
import { handleOnAppInstall } from './handlers/on-app-install';
import { handleOnCommentCreate } from './handlers/on-comment-create';
import { handleOnPostCreate } from './handlers/on-post-create';
import { handleMenuPostCreate } from './handlers/menu-post-create';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

const router = express.Router();

// Public API routes — called from the client via fetch('/api/...').
router.get('/api/init', async (_req, res): Promise<void> => {
  const username = await getCurrentUsername();

  const body: InitResponse = {
    username,
    isModerator: await isCurrentUserModerator(username),
  };
  res.json(body);
});

// Internal routes — wired from devvit.json (triggers, menu). Not called via client fetch.
router.post('/internal/on-comment-create', handleOnCommentCreate);
router.post('/internal/on-post-create', handleOnPostCreate);
router.post('/internal/on-app-install', handleOnAppInstall);
router.post('/internal/menu/post-create', handleMenuPostCreate);

app.use(router);

const port = getServerPort();
const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
