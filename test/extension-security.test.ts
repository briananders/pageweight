import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const FORBIDDEN_NETWORK_AND_SINK_PATTERNS: readonly { name: string; regex: RegExp }[] = [
  { name: 'fetch()', regex: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', regex: /\bXMLHttpRequest\b/ },
  { name: 'WebSocket', regex: /\bWebSocket\b/ },
  { name: 'navigator.sendBeacon', regex: /\bsendBeacon\b/ },
  { name: 'EventSource', regex: /\bEventSource\b/ },
  { name: 'chrome.storage.sync', regex: /\bstorage\.sync\b/ },
  { name: 'eval()', regex: /\beval\s*\(/ },
  { name: 'new Function()', regex: /\bnew\s+Function\s*\(/ },
  { name: 'innerHTML', regex: /\.innerHTML\b/ },
  { name: 'outerHTML', regex: /\.outerHTML\b/ },
  { name: 'insertAdjacentHTML', regex: /\.insertAdjacentHTML\b/ },
  { name: 'document.write', regex: /\bdocument\.write\b/ },
];

/**
 * Recursively collect all file paths within a directory.
 */
function walkFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

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

describe('extension security, privacy, and Chrome Web Store publish readiness', () => {
  const distExtDir = path.resolve('dist-extension');

  it('contains zero outbound network calls, zero chrome.storage.sync, zero unsafe sinks, and zero source maps', () => {
    const files = walkFiles(distExtDir);
    assert.ok(files.length > 0, 'dist-extension must contain compiled files');

    for (const filePath of files) {
      const relative = path.relative(distExtDir, filePath);
      assert.strictEqual(
        relative.endsWith('.map'),
        false,
        `Source map must not ship in dist-extension: ${relative}`
      );

      if (filePath.endsWith('.js') || filePath.endsWith('.html') || filePath.endsWith('.css')) {
        const content = fs.readFileSync(filePath, 'utf-8');
        assert.strictEqual(
          EMAIL_PATTERN.test(content),
          false,
          `Extension output must not contain an email address: ${relative}`
        );

        if (filePath.endsWith('.js')) {
          for (const check of FORBIDDEN_NETWORK_AND_SINK_PATTERNS) {
            assert.strictEqual(
              check.regex.test(content),
              false,
              `Disallowed pattern ${check.name} found in ${relative}`
            );
          }
        }
      }
    }
  });

  it('enforces strict MV3 CSP with connect-src none, valid store metadata, and zero emails in store docs', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(distExtDir, 'manifest.json'), 'utf-8')
    );

    assert.strictEqual(manifest.author, 'Brian Anders');
    assert.strictEqual(manifest.homepage_url, 'https://briananders.com');
    assert.ok(
      manifest.description.length <= 132,
      `Manifest description exceeds 132 chars (${manifest.description.length})`
    );

    const csp: string = manifest.content_security_policy?.extension_pages ?? '';
    assert.ok(csp.includes("connect-src 'none'"), 'CSP must forbid outbound connections');
    assert.ok(csp.includes("script-src 'self'"), 'CSP must restrict scripts to self');
    assert.ok(csp.includes("object-src 'none'"), 'CSP must disallow plugins/objects');

    const storeDoc = fs.readFileSync(path.resolve('CHROMEWEBSTORE.md'), 'utf-8');
    const privacyDoc = fs.readFileSync(path.resolve('docs/privacy.html'), 'utf-8');
    assert.strictEqual(EMAIL_PATTERN.test(storeDoc), false, 'CHROMEWEBSTORE.md must not include an email');
    assert.strictEqual(EMAIL_PATTERN.test(privacyDoc), false, 'docs/privacy.html must not include an email');
    assert.ok(storeDoc.includes('Brian Anders'));
    assert.ok(storeDoc.includes('https://briananders.com'));
    assert.ok(privacyDoc.includes('Brian Anders'));
    assert.ok(privacyDoc.includes('https://briananders.com'));
  });

  it('packages a clean submission ZIP archive and valid Chrome Web Store graphics', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(distExtDir, 'manifest.json'), 'utf-8')
    );
    const zipPath = path.resolve('release', `pageweight-v${manifest.version}.zip`);
    assert.ok(fs.existsSync(zipPath), `Submission ZIP must exist at ${zipPath}`);

    const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf-8' })
      .split('\n')
      .filter((entry) => entry.trim().length > 0);

    assert.ok(listing.includes('manifest.json'), 'ZIP must contain manifest.json at root');
    for (const entry of listing) {
      assert.strictEqual(entry.endsWith('.map'), false, `ZIP must not include source map: ${entry}`);
      assert.strictEqual(entry.includes('CHROMEWEBSTORE.md'), false);
      assert.strictEqual(entry.includes('README.md'), false);
      assert.strictEqual(entry.includes('.DS_Store'), false);
    }

    const screenshot1 = readPngDimensions(
      path.resolve('store-assets/screenshot-1-light-1280x800.png')
    );
    const screenshot2 = readPngDimensions(
      path.resolve('store-assets/screenshot-2-dark-1280x800.png')
    );
    const promoTile = readPngDimensions(path.resolve('store-assets/promo-tile-440x280.png'));

    assert.deepStrictEqual(screenshot1, { width: 1280, height: 800 });
    assert.deepStrictEqual(screenshot2, { width: 1280, height: 800 });
    assert.deepStrictEqual(promoTile, { width: 440, height: 280 });
  });
});
