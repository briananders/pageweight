import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { describe, it } from 'node:test';
import puppeteer from 'puppeteer';

const BREAKPOINT_WIDTHS = [360, 600, 800, 1024, 1440] as const;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

/**
 * Serve the compiled dist-extension directory over localhost so ES module scripts load cleanly in Chromium.
 */
async function startExtensionStaticServer(
  rootDir: string
): Promise<{ server: http.Server; baseUrl: string }> {
  const server = http.createServer((request, response) => {
    const requestPath = (request.url ?? '/').split('?')[0] ?? '/';
    const safeRelative = requestPath.replace(/^\/+/, '');
    const filePath = path.resolve(rootDir, safeRelative);

    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(fs.readFileSync(filePath));
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

describe('extension sidepanel responsive layout integrity', () => {
  it('renders cleanly with zero overflow or container breakage across 360px, 600px, 800px, 1024px, and 1440px', async () => {
    const distExtDir = path.resolve('dist-extension');
    const { server, baseUrl } = await startExtensionStaticServer(distExtDir);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => {
        if (error instanceof Error) {
          pageErrors.push(error.message);
        } else {
          pageErrors.push(String(error));
        }
      });

      // Inject a chrome.* runtime/storage mock matching session-only report storage and local preferences.
      await page.evaluateOnNewDocument(() => {
        const longAssetUrl =
          'https://cdn.example-static-assets.com/releases/2026/11/bundles/hero-photography-ultra-wide-banner-very-long-cachebusted-filename-0123456789abcdef.webp?quality=85&format=auto&signature=abcdef1234567890';

        const localStore: Record<string, unknown> = {
          pageweightBudgets: {
            total: '500KB',
            perImage: '200KB',
          },
          pageweightScanOptions: {
            scroll: true,
            bypassCache: true,
            waitAfterScrollMs: 1500,
          },
        };

        const sessionStore: Record<string, unknown> = {
          pageweightLatestReport: {
            scannedAt: '2026-11-27T08:00:00.000Z',
            result: {
              url: 'https://example.com/very/long/path/to/product-showcase-page?utm_source=audit',
              viewport: { width: 1440, height: 900 },
              totalSize: 760000,
              totalSizeFormatted: '742.19 KB',
              requestCount: 4,
              assets: [
                {
                  url: longAssetUrl,
                  type: 'Image',
                  mimeType: 'image/webp',
                  statusCode: 200,
                  size: 450000,
                },
                {
                  url: 'https://cdn.example-static-assets.com/js/app.bundle.min.js',
                  type: 'Script',
                  mimeType: 'application/javascript',
                  statusCode: 200,
                  size: 210000,
                },
                {
                  url: 'https://cdn.example-static-assets.com/css/design-system.css',
                  type: 'Stylesheet',
                  mimeType: 'text/css',
                  statusCode: 200,
                  size: 65000,
                },
                {
                  url: 'https://example.com/very/long/path/to/product-showcase-page',
                  type: 'Document',
                  mimeType: 'text/html',
                  statusCode: 200,
                  size: 35000,
                },
              ],
            },
          },
        };

        const mockChrome = {
          storage: {
            local: {
              async get(key: string) {
                return { [key]: localStore[key] };
              },
              async set(values: Record<string, unknown>) {
                Object.assign(localStore, values);
              },
            },
            session: {
              async get(key: string) {
                return { [key]: sessionStore[key] };
              },
              async set(values: Record<string, unknown>) {
                Object.assign(sessionStore, values);
              },
              async remove(key: string) {
                delete sessionStore[key];
              },
            },
          },
          runtime: {
            async sendMessage(message: { type: string }) {
              if (message.type === 'GET_ACTIVE_TAB') {
                return {
                  tabId: 1,
                  url: 'https://example.com/very/long/path/to/product-showcase-page',
                  title: 'Example Showcase',
                  analyzable: true,
                };
              }
              return undefined;
            },
            connect() {
              return {
                onMessage: { addListener() {} },
                onDisconnect: { addListener() {} },
                postMessage() {},
                disconnect() {},
              };
            },
          },
          tabs: {
            onActivated: { addListener() {} },
            onUpdated: { addListener() {} },
          },
        };

        Object.defineProperty(window, 'chrome', {
          value: mockChrome,
          configurable: true,
        });
      });

      await page.goto(`${baseUrl}/sidepanel/sidepanel.html`, {
        waitUntil: 'networkidle0',
      });

      // Open the budgets form so every form control is also validated across breakpoints.
      await page.click('#budgets-panel summary');

      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMediaFeatures([
          { name: 'prefers-color-scheme', value: colorScheme },
        ]);

        for (const width of BREAKPOINT_WIDTHS) {
          await page.setViewport({ width, height: 900 });

          const audit = await page.evaluate(() => {
            const viewportWidth = window.innerWidth;
            const docScrollWidth = document.documentElement.scrollWidth;
            const bodyScrollWidth = document.body.scrollWidth;
            const reportVisible = !document.getElementById('report-section')?.hidden;
            const violationsVisible = !document.getElementById('violations-card')?.hidden;

            const overflowingElements: string[] = [];
            const elements = document.querySelectorAll(
              '.panel-shell, .panel-header, .card, .metric-tile, .asset-row, .budgets-form input, button, select'
            );

            for (const element of elements) {
              const rect = element.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) {
                continue;
              }
              if (rect.right > viewportWidth + 1 || rect.left < -1) {
                overflowingElements.push(
                  `${element.tagName}.${element.className} (left=${rect.left.toFixed(1)}, right=${rect.right.toFixed(1)})`
                );
              }
            }

            return {
              viewportWidth,
              docScrollWidth,
              bodyScrollWidth,
              reportVisible,
              violationsVisible,
              overflowingElements,
            };
          });

          assert.strictEqual(
            audit.reportVisible,
            true,
            `Report should render at ${width}px (${colorScheme})`
          );
          assert.strictEqual(
            audit.violationsVisible,
            true,
            `Budget violations should render at ${width}px (${colorScheme})`
          );
          assert.ok(
            audit.docScrollWidth <= audit.viewportWidth,
            `Document horizontal overflow at ${width}px (${colorScheme}): scrollWidth=${audit.docScrollWidth} > viewport=${audit.viewportWidth}`
          );
          assert.ok(
            audit.bodyScrollWidth <= audit.viewportWidth,
            `Body horizontal overflow at ${width}px (${colorScheme}): scrollWidth=${audit.bodyScrollWidth} > viewport=${audit.viewportWidth}`
          );
          assert.deepStrictEqual(
            audit.overflowingElements,
            [],
            `Elements broke container bounds at ${width}px (${colorScheme}): ${audit.overflowingElements.join(', ')}`
          );
        }
      }

      // Verify clearing budgets removes the violation alert interactively.
      await page.click('#clear-budgets-button');
      const violationsHiddenAfterClear = await page.evaluate(() => {
        const card = document.getElementById('violations-card');
        return Boolean(card && card.hidden);
      });
      assert.strictEqual(violationsHiddenAfterClear, true);

      // Verify Clear Report wipes in-session site data and restores the empty state.
      await page.click('#clear-report-button');
      const clearedState = await page.evaluate(() => ({
        reportHidden: Boolean(document.getElementById('report-section')?.hidden),
        emptyVisible: !document.getElementById('empty-state')?.hidden,
      }));
      assert.deepStrictEqual(clearedState, { reportHidden: true, emptyVisible: true });
      assert.deepStrictEqual(pageErrors, []);
    } finally {
      await browser.close();
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
