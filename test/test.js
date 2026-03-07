const assert = require('assert');
const { formatBytes, classifyResource, formatTable, formatJSON, formatCSV } = require('../index');

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

console.log('\n' + '='.repeat(40));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40) + '\n');

if (failed > 0) process.exit(1);
