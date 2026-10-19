import { createServer } from 'node:http';
import { scenarios } from './fixtures.mjs';

const port = Number(process.env.MOCK_API_PORT ?? 3001);
const scenarioName = process.env.MOCK_SCENARIO ?? 'mod';

const baseScenario = scenarios[scenarioName] ?? scenarios.mod;
// Mutable copy so approve actions can remove records during the session.
const scenario = { ...baseScenario, records: [...baseScenario.records] };

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseUrl(req) {
  return new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
}

const server = createServer((req, res) => {
  const url = parseUrl(req);
  const { pathname, searchParams } = url;

  if (req.method === 'GET' && pathname === '/api/init') {
    sendJson(res, 200, scenario.init);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/records/total') {
    if (!scenario.init.isModerator) {
      sendJson(res, 403, { error: 'Moderator access required' });
      return;
    }
    sendJson(res, 200, { totalRecords: scenario.records.length });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/records') {
    if (!scenario.init.isModerator) {
      sendJson(res, 403, { error: 'Moderator access required' });
      return;
    }

    const from = Number(searchParams.get('from'));
    const to = Number(searchParams.get('to'));
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      sendJson(res, 400, { error: 'from and to query params are required numbers' });
      return;
    }

    const records = scenario.records.slice(from, to + 1);
    sendJson(res, 200, { records });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/records/clear') {
    if (!scenario.init.isModerator) {
      sendJson(res, 403, { error: 'Moderator access required' });
      return;
    }
    const deletedCount = scenario.records.length;
    scenario.records.length = 0;
    sendJson(res, 200, { deletedCount });
    return;
  }

  const recordActionMatch = pathname.match(
    /^\/api\/records\/([^/]+)\/(approve|dismiss|remove)$/
  );
  if (req.method === 'POST' && recordActionMatch) {
    if (!scenario.init.isModerator) {
      sendJson(res, 403, { error: 'Moderator access required' });
      return;
    }
    const id = decodeURIComponent(recordActionMatch[1]);
    const action = recordActionMatch[2];
    const idx = scenario.records.findIndex((r) => r.id === id);
    if (idx === -1) {
      sendJson(res, 404, { error: 'Record not found' });
      return;
    }
    scenario.records.splice(idx, 1);
    if (action === 'approve') {
      sendJson(res, 200, { approvedRecordId: id, deletedRecordId: id });
    } else if (action === 'dismiss') {
      sendJson(res, 200, { dismissedRecordId: id, deletedRecordId: id });
    } else {
      sendJson(res, 200, { removedRecordId: id, deletedRecordId: id });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[mock-api] scenario=${scenarioName} http://127.0.0.1:${port}`);
});
