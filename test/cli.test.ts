import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildBudgetsFromOptions,
  buildHelpText,
  CliValidationError,
  formatOutput,
  parseArgs,
  readPackageMetadata,
  runCli,
  validateOptions,
  writeOutputFile,
} from '../src/cli.ts';
import type { AnalyzeResult } from '../src/types.ts';

describe('CLI argument parsing', () => {
  it('parses positional URL, width, and flag options', () => {
    const parsed = parseArgs([
      'node',
      'pageweight',
      'https://example.com',
      '1440',
      '--height',
      '900',
      '--format=json',
      '--output',
      'report.json',
      '--timeout=15000',
      '--no-scroll',
      '--budget',
      '2MB',
      '--budget-image=500KB',
      '--budget-per-image',
      '150KB',
    ]);

    assert.strictEqual(parsed.url, 'https://example.com');
    assert.strictEqual(parsed.width, 1440);
    assert.strictEqual(parsed.height, 900);
    assert.strictEqual(parsed.format, 'json');
    assert.strictEqual(parsed.output, 'report.json');
    assert.strictEqual(parsed.timeout, 15000);
    assert.strictEqual(parsed.scroll, false);
    assert.strictEqual(parsed.budget, '2MB');
    assert.strictEqual(parsed.budgetImage, '500KB');
    assert.strictEqual(parsed.budgetPerImage, '150KB');
  });

  it('throws on unknown options or missing flag values', () => {
    assert.throws(
      () => parseArgs(['node', 'pageweight', '--does-not-exist']),
      CliValidationError
    );
    assert.throws(() => parseArgs(['node', 'pageweight', '--format']), CliValidationError);
  });
});

describe('CLI validation and budgets', () => {
  it('prepends https:// when scheme is omitted and defaults height to width', () => {
    const parsed = parseArgs(['node', 'pageweight', 'example.com', '1280']);
    const validated = validateOptions(parsed);

    assert.strictEqual(validated.url, 'https://example.com');
    assert.strictEqual(validated.width, 1280);
    assert.strictEqual(validated.height, 1280);
    assert.strictEqual(validated.format, 'table');
  });

  it('rejects invalid formats, widths, and budget sizes', () => {
    const badFormat = parseArgs([
      'node',
      'pageweight',
      'https://example.com',
      '1440',
      '--format',
      'yaml',
    ]);
    assert.throws(() => validateOptions(badFormat), CliValidationError);

    const badWidth = parseArgs(['node', 'pageweight', 'https://example.com', '0']);
    assert.throws(() => validateOptions(badWidth), CliValidationError);

    const badBudget = parseArgs([
      'node',
      'pageweight',
      'https://example.com',
      '1440',
      '--budget-script',
      'not-a-size',
    ]);
    assert.throws(() => buildBudgetsFromOptions(badBudget), CliValidationError);
  });

  it('builds a typed budgets object from valid budget flags', () => {
    const parsed = parseArgs([
      'node',
      'pageweight',
      'https://example.com',
      '1440',
      '--budget',
      '2MB',
      '--budget-media',
      '5MB',
      '--budget-per-asset',
      '500KB',
    ]);
    const budgets = buildBudgetsFromOptions(parsed);

    assert.deepStrictEqual(budgets, {
      total: '2MB',
      media: '5MB',
      perAsset: '500KB',
    });
  });
});

describe('CLI export and metadata helpers', () => {
  const sampleResult: AnalyzeResult = {
    url: 'https://example.com',
    viewport: { width: 1440, height: 900 },
    assets: [
      {
        url: 'https://example.com/app.js',
        type: 'Script',
        mimeType: 'application/javascript',
        statusCode: 200,
        size: 2048,
      },
    ],
    totalSize: 2048,
    totalSizeFormatted: '2.00 KB',
    requestCount: 1,
  };

  it('formats output in table, json, and csv modes', () => {
    assert.ok(formatOutput(sampleResult, 'table').includes('TOTAL PAGE WEIGHT'));
    assert.strictEqual(JSON.parse(formatOutput(sampleResult, 'json')).summary.totalSize, 2048);
    assert.ok(formatOutput(sampleResult, 'csv').startsWith('type,url,size_bytes,size_formatted'));
  });

  it('writes formatted output to disk', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pageweight-test-'));
    try {
      const targetFile = path.join(tempDir, 'out.csv');
      const writtenPath = writeOutputFile(targetFile, formatOutput(sampleResult, 'csv'));
      assert.strictEqual(writtenPath, targetFile);
      const contents = fs.readFileSync(writtenPath, 'utf-8');
      assert.ok(contents.includes('https://example.com/app.js'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reads package metadata and handles --help and --version flags cleanly', async () => {
    const pkg = readPackageMetadata();
    assert.strictEqual(pkg.name, '@briananders/pageweight');
    assert.ok(buildHelpText(pkg).includes('pageweight <url> <viewport-width>'));

    assert.strictEqual(await runCli(['node', 'pageweight', '--help']), 0);
    assert.strictEqual(await runCli(['node', 'pageweight', '--version']), 0);
    assert.strictEqual(await runCli(['node', 'pageweight']), 1);
  });
});
