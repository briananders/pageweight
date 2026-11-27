import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildAnalyzeResult,
  createNetworkCollector,
  handleCdpNetworkEvent,
  isAnalyzableUrl,
} from '../extension/src/collector.ts';
import { buildExportPayload } from '../extension/src/export.ts';

/**
 * Read pixel width and height directly from a PNG file's IHDR header chunk.
 */
function readPngDimensions(filePath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(filePath);
  const signature = buffer.subarray(0, 8).toString('hex');
  assert.strictEqual(signature, '89504e470d0a1a0a', `${filePath} must be a valid PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe('extension CDP network collector', () => {
  it('validates analyzable HTTP and HTTPS URLs only', () => {
    assert.strictEqual(isAnalyzableUrl('https://example.com/page'), true);
    assert.strictEqual(isAnalyzableUrl('http://127.0.0.1:8080/'), true);
    assert.strictEqual(isAnalyzableUrl('chrome://extensions'), false);
    assert.strictEqual(isAnalyzableUrl('chrome-extension://abcdef/sidepanel.html'), false);
    assert.strictEqual(isAnalyzableUrl('about:blank'), false);
    assert.strictEqual(isAnalyzableUrl(undefined), false);
    assert.strictEqual(isAnalyzableUrl(''), false);
  });

  it('collects finished and failed non-data assets from CDP events', () => {
    const collector = createNetworkCollector();

    handleCdpNetworkEvent(collector, 'Network.responseReceived', {
      requestId: 'req-1',
      response: {
        url: 'https://example.com/app.js',
        mimeType: 'application/javascript',
        status: 200,
        encodedDataLength: 500,
      },
    });
    handleCdpNetworkEvent(collector, 'Network.loadingFinished', {
      requestId: 'req-1',
      encodedDataLength: 4096,
    });

    handleCdpNetworkEvent(collector, 'Network.responseReceived', {
      requestId: 'req-2',
      response: {
        url: 'data:image/png;base64,AAAA',
        mimeType: 'image/png',
        status: 200,
        encodedDataLength: 100,
      },
    });
    handleCdpNetworkEvent(collector, 'Network.loadingFinished', {
      requestId: 'req-2',
      encodedDataLength: 100,
    });

    handleCdpNetworkEvent(collector, 'Network.responseReceived', {
      requestId: 'req-3',
      response: {
        url: 'https://example.com/missing.webp',
        mimeType: 'image/webp',
        status: 404,
        encodedDataLength: 0,
      },
    });
    handleCdpNetworkEvent(collector, 'Network.loadingFailed', {
      requestId: 'req-3',
      errorText: 'net::ERR_ABORTED',
    });

    const result = buildAnalyzeResult(
      'https://example.com/',
      { width: 1280, height: 800 },
      collector.assets
    );

    assert.strictEqual(result.requestCount, 2);
    assert.strictEqual(result.totalSize, 4096);
    assert.strictEqual(result.totalSizeFormatted, '4.00 KB');
    assert.strictEqual(result.assets[0]?.type, 'Script');
    assert.strictEqual(result.assets[1]?.type, 'Image');
    assert.strictEqual(result.assets[1]?.error, 'net::ERR_ABORTED');
  });
});

describe('extension export helper', () => {
  it('builds table, json, and csv export payloads with sanitized filenames', () => {
    const result = buildAnalyzeResult(
      'https://sub.example.com/articles/perf',
      { width: 1440, height: 900 },
      [
        {
          url: 'https://sub.example.com/bundle.js',
          type: 'Script',
          mimeType: 'application/javascript',
          statusCode: 200,
          size: 10240,
        },
      ]
    );

    const tablePayload = buildExportPayload(result, 'table', '2026-11-24');
    assert.strictEqual(tablePayload.filename, 'pageweight-sub.example.com-2026-11-24.txt');
    assert.ok(tablePayload.content.includes('TOTAL PAGE WEIGHT'));

    const jsonPayload = buildExportPayload(result, 'json', '2026-11-24');
    assert.strictEqual(jsonPayload.filename, 'pageweight-sub.example.com-2026-11-24.json');
    assert.strictEqual(JSON.parse(jsonPayload.content).summary.totalSize, 10240);

    const csvPayload = buildExportPayload(result, 'csv', '2026-11-24');
    assert.strictEqual(csvPayload.filename, 'pageweight-sub.example.com-2026-11-24.csv');
    assert.ok(csvPayload.content.startsWith('type,url,size_bytes,size_formatted'));
  });
});

describe('built MV3 extension bundle integrity', () => {
  const distExtDir = path.resolve('dist-extension');

  it('produces a valid Manifest V3 bundle with matching PNG icon dimensions and strict CSP HTML', () => {
    const manifestPath = path.join(distExtDir, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'dist-extension/manifest.json must exist');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.strictEqual(manifest.manifest_version, 3);
    assert.ok(manifest.action, 'manifest must define action');
    assert.strictEqual(
      manifest.action.default_popup,
      undefined,
      'action must not define default_popup when side panel opens on icon click'
    );
    assert.strictEqual(manifest.background.type, 'module');

    const serviceWorkerPath = path.join(distExtDir, manifest.background.service_worker);
    assert.ok(fs.existsSync(serviceWorkerPath), 'compiled service worker must exist');

    const sidePanelPath = path.join(distExtDir, manifest.side_panel.default_path);
    assert.ok(fs.existsSync(sidePanelPath), 'sidepanel.html must exist');

    const html = fs.readFileSync(sidePanelPath, 'utf-8');
    // Verify MV3 CSP hygiene: no inline script blocks and no inline event handlers.
    assert.strictEqual(/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), false);
    assert.strictEqual(/\son[a-z]+\s*=/i.test(html), false);
    assert.ok(html.includes('name="color-scheme"'));

    for (const [sizeKey, iconRelPath] of Object.entries(manifest.icons as Record<string, string>)) {
      const expectedSize = Number(sizeKey);
      const iconAbsPath = path.join(distExtDir, iconRelPath);
      assert.ok(fs.existsSync(iconAbsPath), `icon ${iconRelPath} must exist`);
      const dimensions = readPngDimensions(iconAbsPath);
      assert.strictEqual(dimensions.width, expectedSize);
      assert.strictEqual(dimensions.height, expectedSize);
    }
  });
});
