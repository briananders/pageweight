import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { runCli } from '../src/cli.ts';
import { analyze } from '../src/index.ts';

/**
 * Start a local HTTP server serving HTML, CSS, JS, and SVG assets for deterministic scrape testing.
 */
async function startFixtureServer(): Promise<{ server: http.Server; baseUrl: string }> {
  const htmlBody = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Fixture Page</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <h1>Pageweight Fixture</h1>
    <img src="/logo.svg" alt="logo" />
    <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="inline-data-uri" />
    <script src="/app.js"></script>
  </body>
</html>`;

  const cssBody = 'body { font-family: sans-serif; margin: 0; padding: 24px; }';
  const jsBody = 'window.__fixtureLoaded = true; console.log("fixture ready");';
  const svgBody =
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#222"/></svg>';

  const server = http.createServer((request, response) => {
    if (request.url === '/style.css') {
      response.writeHead(200, { 'Content-Type': 'text/css' });
      response.end(cssBody);
      return;
    }
    if (request.url === '/app.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript' });
      response.end(jsBody);
      return;
    }
    if (request.url === '/logo.svg') {
      response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      response.end(svgBody);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(htmlBody);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

describe('analyze validation and end-to-end scrape', () => {
  it('rejects missing URL and non-positive viewport dimensions', async () => {
    await assert.rejects(() => analyze({ url: '', width: 1440 }), /URL is required/);
    await assert.rejects(
      () => analyze({ url: 'https://example.com', width: 0 }),
      /Width must be a positive number/
    );
    await assert.rejects(
      () => analyze({ url: 'https://example.com', width: 1440, height: -10 }),
      /Height must be a positive number/
    );
  });

  it('scrapes a real page via Puppeteer, collects non-data assets, and supports CLI export + budgets', async () => {
    const { server, baseUrl } = await startFixtureServer();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pageweight-e2e-'));

    try {
      const result = await analyze({
        url: `${baseUrl}/`,
        width: 1024,
        height: 768,
        scroll: true,
        waitAfterScroll: 100,
      });

      assert.strictEqual(result.url, `${baseUrl}/`);
      assert.deepStrictEqual(result.viewport, { width: 1024, height: 768 });
      assert.ok(result.totalSize > 0);
      assert.ok(result.requestCount >= 4);

      const types = new Set(result.assets.map((asset) => asset.type));
      assert.ok(types.has('Document'));
      assert.ok(types.has('Stylesheet'));
      assert.ok(types.has('Script'));
      assert.ok(types.has('Image'));

      // Ensure inline data: URIs are excluded from collected assets.
      const hasDataUri = result.assets.some((asset) => asset.url.startsWith('data:'));
      assert.strictEqual(hasDataUri, false);

      // Verify end-to-end CLI JSON export and passing budget.
      const jsonOutPath = path.join(tempDir, 'report.json');
      const passExitCode = await runCli([
        'node',
        'pageweight',
        `${baseUrl}/`,
        '1024',
        '--no-scroll',
        '--format',
        'json',
        '--output',
        jsonOutPath,
        '--budget',
        '5MB',
      ]);
      assert.strictEqual(passExitCode, 0);

      const exportedReport = JSON.parse(fs.readFileSync(jsonOutPath, 'utf-8'));
      assert.strictEqual(exportedReport.url, `${baseUrl}/`);
      assert.ok(exportedReport.summary.totalSize > 0);

      // Verify CLI returns exit code 1 when a budget is violated.
      const failExitCode = await runCli([
        'node',
        'pageweight',
        `${baseUrl}/`,
        '1024',
        '--no-scroll',
        '--budget',
        '1B',
      ]);
      assert.strictEqual(failExitCode, 1);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
