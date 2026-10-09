import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const clientDir = path.resolve(__dirname, '..');

const mockPort = process.env.MOCK_API_PORT ?? '3001';
const vitePort = process.env.UI_PREVIEW_PORT ?? '7474';
const scenario = process.env.MOCK_SCENARIO ?? 'mod';

const children = [];

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    stdio: options.stdio ?? 'inherit',
    shell: false,
  });
  children.push(child);
  if (mode === 'serve') {
    child.on('exit', (code, signal) => {
      if (signal) process.exit(1);
      if (code && code !== 0) process.exit(code);
    });
  }
  return child;
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

const mode = process.argv[2] ?? 'serve';

run('node', [path.join(__dirname, 'mock-server.mjs')], {
  env: { MOCK_API_PORT: mockPort, MOCK_SCENARIO: scenario },
});

const viteBin = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');

run('node', [viteBin, '--port', vitePort], {
  cwd: clientDir,
  env: {
    MOCK_API_PORT: mockPort,
    UI_PREVIEW_PORT: vitePort,
  },
});

if (mode === 'capture') {
  // Let mock + Vite bind before Playwright hits the preview URLs.
  setTimeout(() => {
    const capture = run(
      'node',
      [path.join(__dirname, 'capture-screenshots.mjs')],
      {
        env: {
          UI_PREVIEW_URL: `http://127.0.0.1:${vitePort}`,
        },
        stdio: 'inherit',
      }
    );

    capture.on('exit', (code) => {
      shutdown();
      process.exit(code ?? 0);
    });
  }, 2000);
}
