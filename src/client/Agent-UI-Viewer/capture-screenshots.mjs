import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'screenshots');
const baseUrl = process.env.UI_PREVIEW_URL ?? 'http://127.0.0.1:7474';

const captures = [
  { name: 'inline-mod', path: '/inline.html', width: 390, height: 844 },
  { name: 'main-mod', path: '/main.html', width: 1200, height: 800 },
];

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Preview server not ready: ${url}`);
}

async function capture() {
  await mkdir(outDir, { recursive: true });
  await waitForServer(`${baseUrl}/inline.html`);

  const browser = await chromium.launch();
  const manifest = [];

  try {
    for (const target of captures) {
      const page = await browser.newPage();
      await page.setViewportSize({ width: target.width, height: target.height });
      await page.goto(`${baseUrl}${target.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const filePath = path.join(outDir, `${target.name}.png`);
      await page.screenshot({ path: filePath, fullPage: true });
      manifest.push({
        name: target.name,
        file: filePath,
        viewport: `${target.width}x${target.height}`,
        url: `${baseUrl}${target.path}`,
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const manifestPath = path.join(outDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({ capturedAt: new Date().toISOString(), captures: manifest }, null, 2));
  console.log(`[ui:capture] wrote ${manifest.length} screenshots to ${outDir}`);
}

capture().catch((error) => {
  console.error('[ui:capture] failed', error);
  process.exit(1);
});
