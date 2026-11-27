import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface NpmPackEntry {
  filename: string;
  files: Array<{ path: string; size: number }>;
}

const REPO_ROOT = path.resolve('.');
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const EXPECTED_EXPORTS = [
  'analyze',
  'checkBudgets',
  'classifyResource',
  'formatBytes',
  'formatCSV',
  'formatJSON',
  'formatTable',
  'parseSizeString',
];

/**
 * Start a lightweight local HTTP server for end-to-end installed CLI binary testing.
 */
async function startCliFixtureServer(): Promise<{ server: http.Server; baseUrl: string }> {
  const server = http.createServer((request, response) => {
    if (request.url === '/app.js') {
      response.writeHead(200, { 'Content-Type': 'application/javascript' });
      response.end('console.log("installed-cli-fixture");');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><body><h1>Installed CLI</h1><script src="/app.js"></script></body></html>');
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
 * Create a clean temporary consumer workspace with the packed npm tarball installed under node_modules.
 */
function unpackTarballIntoConsumer(tarballPath: string, consumerDir: string): {
  pkgDir: string;
  binLinkPath: string;
} {
  const scopeDir = path.join(consumerDir, 'node_modules', '@briananders');
  const pkgDir = path.join(scopeDir, 'pageweight');
  const binDir = path.join(consumerDir, 'node_modules', '.bin');

  fs.mkdirSync(pkgDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  execFileSync('tar', ['-xzf', tarballPath, '-C', pkgDir, '--strip-components=1'], {
    stdio: 'pipe',
  });

  // Link runtime dependency puppeteer from the workspace so consumer tests run offline without re-downloading Chrome.
  fs.symlinkSync(
    path.join(REPO_ROOT, 'node_modules', 'puppeteer'),
    path.join(consumerDir, 'node_modules', 'puppeteer'),
    'dir'
  );

  // Mirror npm's bin symlink layout (node_modules/.bin/pageweight -> ../@briananders/pageweight/dist/bin/pageweight.js).
  const binLinkPath = path.join(binDir, 'pageweight');
  fs.symlinkSync('../@briananders/pageweight/dist/bin/pageweight.js', binLinkPath);

  return { pkgDir, binLinkPath };
}

describe('npm package deployment readiness', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8'));

  it('has valid public publish metadata, bumped version, executable CLI bin, and no author email', () => {
    assert.strictEqual(pkg.name, '@briananders/pageweight');
    assert.strictEqual(pkg.type, 'module');
    assert.strictEqual(pkg.publishConfig?.access, 'public');
    assert.strictEqual(pkg.engines?.node, '>=26.0.0');

    // Verify semver version is strictly higher than the previously published 2.0.0 release.
    const major = Number(String(pkg.version).split('.')[0]);
    assert.ok(major >= 3, `Expected major version >= 3 after Node 26/ESM upgrade, got ${pkg.version}`);

    const authorSerialized = JSON.stringify(pkg.author);
    assert.strictEqual(EMAIL_PATTERN.test(authorSerialized), false, 'package.json author must not include an email');
    assert.strictEqual(pkg.author?.name, 'Brian Anders');
    assert.strictEqual(pkg.author?.url, 'https://briananders.com');

    const mainPath = path.resolve(REPO_ROOT, pkg.main);
    const typesPath = path.resolve(REPO_ROOT, pkg.types);
    const binPath = path.resolve(REPO_ROOT, pkg.bin.pageweight);

    // npm publish normalizes bin paths without a leading "./" and warns if "./" is present.
    assert.strictEqual(
      String(pkg.bin.pageweight).startsWith('./'),
      false,
      'package.json bin path must not start with "./"'
    );

    assert.ok(fs.existsSync(mainPath), 'main entry must exist');
    assert.ok(fs.existsSync(typesPath), 'types entry must exist');
    assert.ok(fs.existsSync(binPath), 'bin entry must exist');

    const binContent = fs.readFileSync(binPath, 'utf-8');
    assert.ok(binContent.startsWith('#!/usr/bin/env node'), 'CLI bin must start with node shebang');

    const binMode = fs.statSync(binPath).mode;
    assert.ok((binMode & 0o111) !== 0, 'CLI bin must have executable permission bits set');
  });

  it('packs a clean tarball and works for ESM, CJS, TypeScript, and symlinked CLI consumers', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pageweight-npm-deploy-'));
    const { server, baseUrl } = await startCliFixtureServer();

    try {
      // Clear inherited npm_config_dry_run so npm publish --dry-run still packs the test tarball into tempDir.
      const packEnv: NodeJS.ProcessEnv = { ...process.env };
      delete packEnv['npm_config_dry_run'];

      const packOutput = execFileSync(
        'npm',
        ['pack', '--dry-run=false', '--pack-destination', tempDir, '--json'],
        { cwd: REPO_ROOT, encoding: 'utf-8', env: packEnv }
      );
      const parsedPack = JSON.parse(packOutput) as
        | NpmPackEntry[]
        | Record<string, NpmPackEntry>;
      let entry: NpmPackEntry | undefined;
      if (Array.isArray(parsedPack)) {
        entry = parsedPack[0];
      } else {
        entry = parsedPack[pkg.name] ?? Object.values(parsedPack)[0];
      }
      assert.ok(entry, 'npm pack must report tarball metadata');

      const packedPaths = entry.files.map((file) => file.path);
      assert.ok(packedPaths.includes('package.json'));
      assert.ok(packedPaths.includes('README.md'));
      assert.ok(packedPaths.includes('LICENSE'));
      assert.ok(packedPaths.includes('dist/index.js'));
      assert.ok(packedPaths.includes('dist/index.d.ts'));
      assert.ok(packedPaths.includes('dist/bin/pageweight.js'));

      const forbiddenPrefixes = [
        'src/',
        'test/',
        'extension/',
        'dist-extension/',
        'release/',
        'store-assets/',
        'docs/',
        'scripts/',
        '.github/',
      ];

      for (const filePath of packedPaths) {
        assert.notStrictEqual(
          filePath,
          'CHROMEWEBSTORE.md',
          'CHROMEWEBSTORE.md must not leak into npm tarball'
        );
        for (const prefix of forbiddenPrefixes) {
          assert.strictEqual(
            filePath.startsWith(prefix),
            false,
            `Disallowed file leaked into npm tarball: ${filePath}`
          );
        }
      }

      const tarballPath = path.join(tempDir, entry.filename);
      const consumerDir = path.join(tempDir, 'consumer');
      fs.mkdirSync(consumerDir, { recursive: true });
      fs.writeFileSync(
        path.join(consumerDir, 'package.json'),
        JSON.stringify({ name: 'consumer-test', private: true, type: 'module' }, null, 2),
        'utf-8'
      );

      const { binLinkPath } = unpackTarballIntoConsumer(tarballPath, consumerDir);

      // 1. Verify ESM consumer import.
      const esmExports = execFileSync(
        process.execPath,
        [
          '-e',
          "import * as pw from '@briananders/pageweight'; console.log(JSON.stringify(Object.keys(pw).sort()));",
        ],
        { cwd: consumerDir, encoding: 'utf-8' }
      ).trim();
      assert.deepStrictEqual(JSON.parse(esmExports), EXPECTED_EXPORTS);

      // 2. Verify CommonJS consumer require() on Node 26.
      const cjsExports = execFileSync(
        process.execPath,
        [
          '-e',
          "const pw = require('@briananders/pageweight'); console.log(JSON.stringify(Object.keys(pw).sort()));",
        ],
        { cwd: consumerDir, encoding: 'utf-8' }
      ).trim();
      assert.deepStrictEqual(JSON.parse(cjsExports), EXPECTED_EXPORTS);

      // 3. Verify TypeScript declaration types compile cleanly in a consumer project.
      const consumerTsPath = path.join(consumerDir, 'check.ts');
      fs.writeFileSync(
        consumerTsPath,
        `import {
  analyze,
  checkBudgets,
  formatCSV,
  formatJSON,
  formatTable,
  type AnalyzeOptions,
  type AnalyzeResult,
  type Asset,
  type Budgets,
  type BudgetViolation,
} from '@briananders/pageweight';

const opts: AnalyzeOptions = { url: 'https://example.com', width: 1440 };
const sample: Asset[] = [{ url: 'https://example.com/a.js', type: 'Script', size: 100 }];
const budgets: Budgets = { total: '1MB' };
const violations: BudgetViolation[] = checkBudgets(sample, budgets);
const report: string = formatTable(sample) + formatJSON(sample) + formatCSV(sample);
void opts;
void violations;
void report;
export type ResultType = AnalyzeResult;
export const runRef = analyze;
`,
        'utf-8'
      );

      const consumerTsConfig = path.join(consumerDir, 'tsconfig.json');
      fs.writeFileSync(
        consumerTsConfig,
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2024',
              module: 'NodeNext',
              moduleResolution: 'NodeNext',
              strict: true,
              noEmit: true,
              skipLibCheck: true,
            },
            include: ['check.ts'],
          },
          null,
          2
        ),
        'utf-8'
      );

      const tscBin = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsc');
      execFileSync(tscBin, ['-p', consumerTsConfig], { cwd: consumerDir, stdio: 'pipe' });

      // 4. Verify symlinked CLI binary runs directly via shebang for --version, --help, and live scrape.
      const versionOut = execFileSync(binLinkPath, ['--version'], {
        cwd: consumerDir,
        encoding: 'utf-8',
      }).trim();
      assert.strictEqual(versionOut, `@briananders/pageweight v${pkg.version}`);

      const helpOut = execFileSync(binLinkPath, ['--help'], {
        cwd: consumerDir,
        encoding: 'utf-8',
      });
      assert.ok(helpOut.includes('pageweight <url> <viewport-width>'));

      const jsonReportPath = path.join(tempDir, 'cli-report.json');
      // Use async execFile so the in-process HTTP fixture server stays responsive while Chromium fetches it.
      await execFileAsync(
        binLinkPath,
        [
          `${baseUrl}/`,
          '1024',
          '--no-scroll',
          '--format',
          'json',
          '--output',
          jsonReportPath,
          '--budget',
          '5MB',
        ],
        { cwd: consumerDir, encoding: 'utf-8' }
      );
      const cliReport = JSON.parse(fs.readFileSync(jsonReportPath, 'utf-8'));
      assert.strictEqual(cliReport.url, `${baseUrl}/`);
      assert.ok(cliReport.summary.totalSize > 0);
      assert.ok(cliReport.summary.totalRequests >= 2);

      // Verify the installed CLI exits non-zero when a configured budget is exceeded.
      await assert.rejects(
        () => execFileAsync(binLinkPath, [`${baseUrl}/`, '1024', '--no-scroll', '--budget', '1B'], { cwd: consumerDir }),
        (error: NodeJS.ErrnoException & { code?: number; stderr?: string }) => {
          assert.strictEqual(error.code, 1);
          assert.ok((error.stderr ?? '').includes('Budget exceeded!'));
          return true;
        }
      );
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
