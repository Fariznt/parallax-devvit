import express from 'express';
import type { Placeholder } from '../shared/types/api';
import { createServer, context, getServerPort } from '@devvit/web/server';
import { handleOnAppInstall } from './triggers/on-app-install';
import { handleOnCommentCreate } from './triggers/on-comment-create';
import { handleOnPostCreate } from './triggers/on-post-create';
import { handleMenuPostCreate } from './triggers/menu-post-create';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

const router = express.Router();

// Public API routes — called from the client via fetch('/api/...').
router.get('/api/init', async (_req, res): Promise<void> => {
  const { postId } = context;

  if (!postId) {
    res.status(400).json({
      status: 'error',
      message: 'postId is required but missing from context',
    });
    return;
  }

  const body: Placeholder = { type: 'placeholder' };
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
