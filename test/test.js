const assert = require('assert');
const { formatBytes, classifyResource, formatTable, formatJSON, formatCSV, parseSizeString, checkBudgets } = require('../index');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\nformatBytes');

test('formats 0 bytes', () => {
  assert.strictEqual(formatBytes(0), '0 B');
});

test('formats bytes', () => {
  assert.strictEqual(formatBytes(500), '500.00 B');
});

test('formats kilobytes', () => {
  assert.strictEqual(formatBytes(1024), '1.00 KB');
  assert.strictEqual(formatBytes(1536), '1.50 KB');
});

test('formats megabytes', () => {
  assert.strictEqual(formatBytes(1048576), '1.00 MB');
});

test('formats gigabytes', () => {
  assert.strictEqual(formatBytes(1073741824), '1.00 GB');
});

console.log('\nclassifyResource');

test('classifies JavaScript by MIME type', () => {
  assert.strictEqual(classifyResource('application/javascript', 'https://example.com/app.js'), 'Script');
  assert.strictEqual(classifyResource('text/javascript', 'https://example.com/app.js'), 'Script');
});

test('classifies CSS by MIME type', () => {
  assert.strictEqual(classifyResource('text/css', 'https://example.com/style.css'), 'Stylesheet');
});

test('classifies HTML by MIME type', () => {
  assert.strictEqual(classifyResource('text/html', 'https://example.com/'), 'Document');
});

test('classifies images by MIME type', () => {
  assert.strictEqual(classifyResource('image/png', 'https://example.com/img.png'), 'Image');
  assert.strictEqual(classifyResource('image/jpeg', 'https://example.com/img.jpg'), 'Image');
  assert.strictEqual(classifyResource('image/svg+xml', 'https://example.com/icon.svg'), 'Image');
});

test('classifies fonts by MIME type', () => {
  assert.strictEqual(classifyResource('font/woff2', 'https://example.com/font.woff2'), 'Font');
  assert.strictEqual(classifyResource('application/font-woff', 'https://example.com/font.woff'), 'Font');
});

test('classifies media by MIME type', () => {
  assert.strictEqual(classifyResource('video/mp4', 'https://example.com/video.mp4'), 'Media');
  assert.strictEqual(classifyResource('audio/mpeg', 'https://example.com/audio.mp3'), 'Media');
});

test('classifies JSON by MIME type', () => {
  assert.strictEqual(classifyResource('application/json', 'https://example.com/data.json'), 'JSON');
});

test('falls back to extension when no MIME type', () => {
  assert.strictEqual(classifyResource(null, 'https://example.com/app.js'), 'Script');
  assert.strictEqual(classifyResource(null, 'https://example.com/style.css'), 'Stylesheet');
  assert.strictEqual(classifyResource(null, 'https://example.com/image.webp'), 'Image');
  assert.strictEqual(classifyResource(null, 'https://example.com/font.woff2'), 'Font');
  assert.strictEqual(classifyResource(null, 'https://example.com/video.mp4'), 'Media');
});

test('handles unknown types', () => {
  assert.strictEqual(classifyResource(null, 'https://example.com/file.xyz'), 'Other');
  assert.strictEqual(classifyResource('application/octet-stream', 'https://example.com/file'), 'Other');
});

test('handles query parameters in URL extension fallback', () => {
  assert.strictEqual(classifyResource(null, 'https://example.com/app.js?v=123'), 'Script');
  assert.strictEqual(classifyResource(null, 'https://example.com/img.png?w=200#section'), 'Image');
});

console.log('\nformatTable');

test('formats assets into a table string', () => {
  const assets = [
    { url: 'https://example.com/app.js', type: 'Script', size: 50000 },
    { url: 'https://example.com/style.css', type: 'Stylesheet', size: 10000 },
  ];
  const output = formatTable(assets);
  assert.ok(output.includes('Script'));
  assert.ok(output.includes('Stylesheet'));
  assert.ok(output.includes('TOTAL PAGE WEIGHT'));
  assert.ok(output.includes('2 requests'));
});

test('handles single asset', () => {
  const assets = [
    { url: 'https://example.com/app.js', type: 'Script', size: 1024 },
  ];
  const output = formatTable(assets);
  assert.ok(output.includes('1 file'));
  assert.ok(output.includes('1 request'));
});

test('handles empty assets', () => {
  const output = formatTable([]);
  assert.ok(output.includes('TOTAL PAGE WEIGHT'));
  assert.ok(output.includes('0 B'));
});

console.log('\nformatJSON');

test('produces valid JSON with summary', () => {
  const assets = [
    { url: 'https://example.com/app.js', type: 'Script', size: 50000 },
    { url: 'https://example.com/style.css', type: 'Stylesheet', size: 10000 },
  ];
  const output = formatJSON(assets, { url: 'https://example.com', viewport: { width: 1440, height: 1440 } });
  const parsed = JSON.parse(output);

  assert.strictEqual(parsed.url, 'https://example.com');
  assert.strictEqual(parsed.summary.totalSize, 60000);
  assert.strictEqual(parsed.summary.totalRequests, 2);
  assert.ok(parsed.groups.Script);
  assert.ok(parsed.groups.Stylesheet);
  assert.strictEqual(parsed.groups.Script.count, 1);
  assert.ok(parsed.timestamp);
});

console.log('\nformatCSV');

test('produces valid CSV with header row', () => {
  const assets = [
    { url: 'https://example.com/app.js', type: 'Script', size: 50000 },
    { url: 'https://example.com/style.css', type: 'Stylesheet', size: 10000 },
  ];
  const output = formatCSV(assets);
  const lines = output.split('\n');

  assert.strictEqual(lines[0], 'type,url,size_bytes,size_formatted');
  assert.ok(lines.length >= 3);
  assert.ok(lines[1].startsWith('Script,'));
  assert.ok(lines[2].startsWith('Stylesheet,'));
});

test('escapes quotes in URLs', () => {
  const assets = [
    { url: 'https://example.com/path?a="b"', type: 'Script', size: 100 },
  ];
  const output = formatCSV(assets);
  assert.ok(output.includes('""b""'));
});

console.log('\nparseSizeString');

test('parses plain bytes', () => {
  assert.strictEqual(parseSizeString('1024'), 1024);
  assert.strictEqual(parseSizeString('0'), 0);
});

test('parses B suffix', () => {
  assert.strictEqual(parseSizeString('500B'), 500);
  assert.strictEqual(parseSizeString('500b'), 500);
  assert.strictEqual(parseSizeString('500 B'), 500);
});

test('parses KB suffix', () => {
  assert.strictEqual(parseSizeString('1KB'), 1024);
  assert.strictEqual(parseSizeString('500KB'), 512000);
  assert.strictEqual(parseSizeString('1.5KB'), 1536);
});

test('parses MB suffix', () => {
  assert.strictEqual(parseSizeString('1MB'), 1048576);
  assert.strictEqual(parseSizeString('2.5MB'), 2621440);
});

test('parses GB suffix', () => {
  assert.strictEqual(parseSizeString('1GB'), 1073741824);
});

test('is case insensitive', () => {
  assert.strictEqual(parseSizeString('1mb'), 1048576);
  assert.strictEqual(parseSizeString('1Mb'), 1048576);
  assert.strictEqual(parseSizeString('1MB'), 1048576);
});

test('accepts a number directly', () => {
  assert.strictEqual(parseSizeString(2048), 2048);
  assert.strictEqual(parseSizeString(1.7), 1);
});

test('throws on invalid format', () => {
  assert.throws(() => parseSizeString('abc'), /Invalid size format/);
  assert.throws(() => parseSizeString('1TB'), /Invalid size format/);
  assert.throws(() => parseSizeString(''), /Invalid size format/);
  assert.throws(() => parseSizeString('MB'), /Invalid size format/);
});

console.log('\ncheckBudgets');

const sampleAssets = [
  { url: 'https://example.com/app.js', type: 'Script', size: 200000 },
  { url: 'https://example.com/vendor.js', type: 'Script', size: 150000 },
  { url: 'https://example.com/style.css', type: 'Stylesheet', size: 50000 },
  { url: 'https://example.com/hero.jpg', type: 'Image', size: 300000 },
  { url: 'https://example.com/icon.png', type: 'Image', size: 5000 },
  { url: 'https://example.com/thumb.webp', type: 'Image', size: 20000 },
  { url: 'https://example.com/video.mp4', type: 'Media', size: 5000000 },
  { url: 'https://example.com/clip.webm', type: 'Media', size: 1000000 },
  { url: 'https://example.com/font.woff2', type: 'Font', size: 40000 },
  { url: 'https://example.com/', type: 'Document', size: 15000 },
];
const sampleTotal = sampleAssets.reduce((s, a) => s + a.size, 0);

test('returns empty array when no budgets set', () => {
  assert.deepStrictEqual(checkBudgets(sampleAssets, {}), []);
  assert.deepStrictEqual(checkBudgets(sampleAssets, null), []);
});

test('total budget - passes when under', () => {
  const violations = checkBudgets(sampleAssets, { total: '100MB' });
  assert.strictEqual(violations.length, 0);
});

test('total budget - fails when over', () => {
  const violations = checkBudgets(sampleAssets, { total: '1MB' });
  assert.strictEqual(violations.length, 1);
  assert.strictEqual(violations[0].rule, 'total');
  assert.ok(violations[0].actual > parseSizeString('1MB'));
});

test('image group budget - passes when under', () => {
  const violations = checkBudgets(sampleAssets, { image: '1MB' });
  assert.strictEqual(violations.length, 0);
});

test('image group budget - fails when over', () => {
  const violations = checkBudgets(sampleAssets, { image: '100KB' });
  assert.strictEqual(violations.length, 1);
  assert.strictEqual(violations[0].rule, 'image');
});

test('media group budget - fails when over', () => {
  const violations = checkBudgets(sampleAssets, { media: '1MB' });
  assert.strictEqual(violations.length, 1);
  assert.strictEqual(violations[0].rule, 'media');
});

test('script group budget - fails when over', () => {
  const violations = checkBudgets(sampleAssets, { script: '100KB' });
  assert.strictEqual(violations.length, 1);
  assert.strictEqual(violations[0].rule, 'script');
});

test('stylesheet group budget - passes when under', () => {
  const violations = checkBudgets(sampleAssets, { stylesheet: '100KB' });
  assert.strictEqual(violations.length, 0);
});

test('font group budget', () => {
  const pass = checkBudgets(sampleAssets, { font: '100KB' });
  assert.strictEqual(pass.length, 0);
  const fail = checkBudgets(sampleAssets, { font: '10KB' });
  assert.strictEqual(fail.length, 1);
  assert.strictEqual(fail[0].rule, 'font');
});

test('document group budget', () => {
  const pass = checkBudgets(sampleAssets, { document: '100KB' });
  assert.strictEqual(pass.length, 0);
  const fail = checkBudgets(sampleAssets, { document: '10KB' });
  assert.strictEqual(fail.length, 1);
  assert.strictEqual(fail[0].rule, 'document');
});

test('per-asset budget - catches oversized assets', () => {
  const violations = checkBudgets(sampleAssets, { perAsset: '200KB' });
  const oversized = sampleAssets.filter((a) => a.size > parseSizeString('200KB'));
  assert.strictEqual(violations.length, oversized.length);
  for (const v of violations) {
    assert.strictEqual(v.rule, 'perAsset');
    assert.ok(v.asset);
  }
});

test('per-asset budget - passes when all under limit', () => {
  const violations = checkBudgets(sampleAssets, { perAsset: '10MB' });
  assert.strictEqual(violations.length, 0);
});

test('per-image budget - only checks images', () => {
  const violations = checkBudgets(sampleAssets, { perImage: '100KB' });
  assert.strictEqual(violations.length, 1);
  assert.strictEqual(violations[0].rule, 'perImage');
  assert.strictEqual(violations[0].asset.type, 'Image');
  assert.ok(violations[0].asset.url.includes('hero.jpg'));
});

test('per-media budget - only checks media', () => {
  const violations = checkBudgets(sampleAssets, { perMedia: '2MB' });
  assert.strictEqual(violations.length, 1);
  assert.strictEqual(violations[0].rule, 'perMedia');
  assert.strictEqual(violations[0].asset.type, 'Media');
  assert.ok(violations[0].asset.url.includes('video.mp4'));
});

test('multiple budgets can produce multiple violations', () => {
  const violations = checkBudgets(sampleAssets, {
    total: '1MB',
    image: '100KB',
    media: '1MB',
    perImage: '100KB',
    perMedia: '2MB',
  });
  assert.ok(violations.length >= 4);
  const rules = violations.map((v) => v.rule);
  assert.ok(rules.includes('total'));
  assert.ok(rules.includes('image'));
  assert.ok(rules.includes('media'));
  assert.ok(rules.includes('perImage'));
  assert.ok(rules.includes('perMedia'));
});

test('budgets accept string sizes', () => {
  const violations = checkBudgets(sampleAssets, { total: '1KB' });
  assert.strictEqual(violations.length, 1);
});

test('budgets accept numeric values (bytes)', () => {
  const violations = checkBudgets(sampleAssets, { total: 1024 });
  assert.strictEqual(violations.length, 1);
});

test('group budget ignores empty groups', () => {
  const violations = checkBudgets(sampleAssets, { xml: '1B' });
  assert.strictEqual(violations.length, 0);
});

console.log('\n' + '='.repeat(40));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40) + '\n');

if (failed > 0) process.exit(1);
