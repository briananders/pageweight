import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import puppeteer, { type Browser } from 'puppeteer';

const DIST_EXTENSION_DIR = path.resolve('dist-extension');
const STORE_ASSETS_DIR = path.resolve('store-assets');

const MIME_BY_EXTENSION: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

/**
 * Start a local HTTP server for dist-extension so ES modules render cleanly in headless Chromium.
 */
async function startStaticServer(rootDir: string): Promise<{ server: http.Server; baseUrl: string }> {
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

/**
 * Render a 1280x800 Chrome Web Store screenshot of the real side panel UI in light or dark mode.
 */
async function captureSidePanelScreenshot(
  browser: Browser,
  baseUrl: string,
  colorScheme: 'light' | 'dark',
  expandBudgets: boolean,
  outputPath: string
): Promise<void> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: colorScheme }]);

  await page.evaluateOnNewDocument(() => {
    const localStore: Record<string, unknown> = {
      pageweightBudgets: {
        total: '1MB',
        image: '500KB',
        perImage: '300KB',
        script: '250KB',
      },
      pageweightScanOptions: {
        scroll: true,
        bypassCache: true,
        waitAfterScrollMs: 1500,
      },
    };

    const sessionStore: Record<string, unknown> = {
      pageweightLatestReport: {
        scannedAt: '2026-11-27T18:30:00.000Z',
        result: {
          url: 'https://briananders.com/',
          viewport: { width: 1440, height: 900 },
          totalSize: 1184200,
          totalSizeFormatted: '1.13 MB',
          requestCount: 7,
          assets: [
            {
              url: 'https://briananders.com/images/hero-banner.webp',
              type: 'Image',
              mimeType: 'image/webp',
              statusCode: 200,
              size: 468000,
            },
            {
              url: 'https://briananders.com/images/feature-preview.jpg',
              type: 'Image',
              mimeType: 'image/jpeg',
              statusCode: 200,
              size: 192400,
            },
            {
              url: 'https://briananders.com/assets/app.bundle.js',
              type: 'Script',
              mimeType: 'application/javascript',
              statusCode: 200,
              size: 238500,
            },
            {
              url: 'https://briananders.com/assets/analytics-lite.js',
              type: 'Script',
              mimeType: 'application/javascript',
              statusCode: 200,
              size: 54200,
            },
            {
              url: 'https://briananders.com/fonts/inter-var.woff2',
              type: 'Font',
              mimeType: 'font/woff2',
              statusCode: 200,
              size: 118000,
            },
            {
              url: 'https://briananders.com/assets/main.css',
              type: 'Stylesheet',
              mimeType: 'text/css',
              statusCode: 200,
              size: 76100,
            },
            {
              url: 'https://briananders.com/',
              type: 'Document',
              mimeType: 'text/html',
              statusCode: 200,
              size: 37000,
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
              url: 'https://briananders.com/',
              title: 'Brian Anders',
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

  await page.goto(`${baseUrl}/sidepanel/sidepanel.html`, { waitUntil: 'networkidle0' });

  if (expandBudgets) {
    await page.click('#budgets-panel summary');
    await page.evaluate(() => {
      const panel = document.getElementById('budgets-panel');
      if (panel) {
        panel.scrollIntoView({ behavior: 'instant', block: 'end' });
      }
    });
  }

  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
}

/**
 * Render a 440x280 Chrome Web Store small promo tile PNG matching the extension's visual identity.
 */
async function captureSmallPromoTile(
  browser: Browser,
  outputPath: string
): Promise<void> {
  const iconDataUrl = `data:image/png;base64,${fs
    .readFileSync(path.join(DIST_EXTENSION_DIR, 'icons', 'icon-128.png'))
    .toString('base64')}`;

  const page = await browser.newPage();
  await page.setViewport({ width: 440, height: 280, deviceScaleFactor: 1 });

  await page.setContent(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        margin: 0;
        width: 440px;
        height: 280px;
        background: linear-gradient(135deg, #0b1120 0%, #111827 55%, #064e3b 100%);
        color: #f8fafc;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 32px;
        box-sizing: border-box;
        gap: 18px;
      }
      .top {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .icon {
        width: 64px;
        height: 64px;
        border-radius: 14px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
      }
      h1 {
        margin: 0;
        font-size: 32px;
        letter-spacing: -0.02em;
      }
      p {
        margin: 0;
        font-size: 16px;
        line-height: 1.45;
        color: #cbd5e1;
      }
      .bar {
        display: flex;
        height: 10px;
        border-radius: 999px;
        overflow: hidden;
        gap: 2px;
      }
      .seg-1 { width: 46%; background: #10b981; }
      .seg-2 { width: 28%; background: #f59e0b; }
      .seg-3 { width: 16%; background: #3b82f6; }
      .seg-4 { width: 10%; background: #8b5cf6; }
    </style>
  </head>
  <body>
    <div class="top">
      <img class="icon" src="${iconDataUrl}" alt="Pageweight" />
      <h1>Pageweight</h1>
    </div>
    <p>Measure webpage transfer weight, inspect heavy assets, enforce budgets, and export reports.</p>
    <div class="bar">
      <div class="seg-1"></div>
      <div class="seg-2"></div>
      <div class="seg-3"></div>
      <div class="seg-4"></div>
    </div>
  </body>
</html>`);

  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
}

/**
 * Generate Chrome Web Store screenshots (1280x800) and small promo tile (440x280) under store-assets/.
 */
async function main(): Promise<void> {
  fs.mkdirSync(STORE_ASSETS_DIR, { recursive: true });
  const { server, baseUrl } = await startStaticServer(DIST_EXTENSION_DIR);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const lightPath = path.join(STORE_ASSETS_DIR, 'screenshot-1-light-1280x800.png');
    const darkPath = path.join(STORE_ASSETS_DIR, 'screenshot-2-dark-1280x800.png');
    const promoPath = path.join(STORE_ASSETS_DIR, 'promo-tile-440x280.png');

    await captureSidePanelScreenshot(browser, baseUrl, 'light', false, lightPath);
    await captureSidePanelScreenshot(browser, baseUrl, 'dark', true, darkPath);
    await captureSmallPromoTile(browser, promoPath);

    console.log('Generated Chrome Web Store graphics in store-assets/');
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
}

void main();
