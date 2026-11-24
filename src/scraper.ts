import puppeteer, { type CDPSession, type Page } from 'puppeteer';
import { classifyResource, formatBytes } from './classify.ts';
import { calculateTotalSize } from './formatters.ts';
import type { AnalyzedAsset, AnalyzeOptions, AnalyzeResult } from './types.ts';

interface PendingResponse {
  url: string;
  mimeType: string;
  statusCode: number;
  encodedDataLength: number;
}

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_WAIT_AFTER_SCROLL_MS = 2000;

/**
 * Wait for a fixed number of milliseconds.
 */
function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

/**
 * Incrementally scroll a page from top to bottom so lazy-loaded assets are requested.
 */
async function scrollToBottom(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const scrollStep = Math.max(window.innerHeight / 2, 400);
      const scrollDelayMs = 200;
      let lastScrollTop = -1;

      const timer = setInterval(() => {
        window.scrollBy(0, scrollStep);
        const currentScroll = document.documentElement.scrollTop || document.body.scrollTop;
        // Stop once the scroll position no longer advances, indicating the bottom of the document.
        if (currentScroll === lastScrollTop) {
          clearInterval(timer);
          resolve();
        }
        lastScrollTop = currentScroll;
      }, scrollDelayMs);
    });
  });
}

/**
 * Attach Chrome DevTools Protocol network listeners to collect every non-data asset into memory.
 */
async function attachNetworkCollector(
  client: CDPSession,
  assets: AnalyzedAsset[]
): Promise<void> {
  await client.send('Network.enable');

  // Store initial response metadata keyed by CDP requestId until loading finishes or fails.
  const responseStore = new Map<string, PendingResponse>();

  client.on('Network.responseReceived', (event) => {
    const { requestId, response } = event;
    responseStore.set(requestId, {
      url: response.url,
      mimeType: response.mimeType,
      statusCode: response.status,
      encodedDataLength: response.encodedDataLength || 0,
    });
  });

  client.on('Network.loadingFinished', (event) => {
    const { requestId, encodedDataLength } = event;
    const responseRecord = responseStore.get(requestId);
    if (!responseRecord) {
      return;
    }

    // Prefer the final wire byte count from loadingFinished, falling back to response headers size.
    const transferSize = encodedDataLength || responseRecord.encodedDataLength || 0;
    if (responseRecord.url && !responseRecord.url.startsWith('data:')) {
      assets.push({
        url: responseRecord.url,
        type: classifyResource(responseRecord.mimeType, responseRecord.url),
        mimeType: responseRecord.mimeType || '',
        statusCode: responseRecord.statusCode,
        size: transferSize,
      });
    }
  });

  client.on('Network.loadingFailed', (event) => {
    const { requestId, errorText } = event;
    const responseRecord = responseStore.get(requestId);
    if (responseRecord && responseRecord.url && !responseRecord.url.startsWith('data:')) {
      assets.push({
        url: responseRecord.url,
        type: classifyResource(responseRecord.mimeType, responseRecord.url),
        mimeType: responseRecord.mimeType || '',
        statusCode: responseRecord.statusCode || 0,
        size: 0,
        error: errorText,
      });
    }
  });
}

/**
 * Validate options passed to analyze before launching Chromium.
 */
function validateAnalyzeOptions(url: string, width: number, height: number): void {
  if (!url) {
    throw new Error('URL is required');
  }
  if (!width || !Number.isFinite(width) || width <= 0) {
    throw new Error('Width must be a positive number');
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error('Height must be a positive number');
  }
}

/**
 * Launch headless Chromium, scrape all network requests for a URL, and return the aggregated weight report.
 */
export async function analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
  const url = options.url;
  const width = options.width;
  const height = options.height ?? width;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const scroll = options.scroll ?? true;
  const waitAfterScroll = options.waitAfterScroll ?? DEFAULT_WAIT_AFTER_SCROLL_MS;

  validateAnalyzeOptions(url, width, height);

  const assets: AnalyzedAsset[] = [];

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });

    const client = await page.createCDPSession();
    await attachNetworkCollector(client, assets);

    await page.goto(url, { waitUntil: 'networkidle2', timeout });

    if (scroll) {
      await scrollToBottom(page);
      if (waitAfterScroll > 0) {
        await delay(waitAfterScroll);
      }
    }

    const totalSize = calculateTotalSize(assets);

    return {
      url,
      viewport: { width, height },
      assets,
      totalSize,
      totalSizeFormatted: formatBytes(totalSize),
      requestCount: assets.length,
    };
  } finally {
    await browser.close();
  }
}
