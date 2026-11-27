import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface ExtensionManifest {
  name: string;
  version: string;
}

const DIST_EXTENSION_DIR = path.resolve('dist-extension');
const RELEASE_DIR = path.resolve('release');

/**
 * Recursively list all files inside a directory relative to that root.
 */
function listRelativeFiles(rootDir: string, currentDir = rootDir): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listRelativeFiles(rootDir, fullPath));
    } else if (entry.isFile()) {
      results.push(path.relative(rootDir, fullPath));
    }
  }

  return results;
}

/**
 * Verify that the built dist-extension directory contains no disallowed dev files before zipping.
 */
function assertCleanExtensionOutput(rootDir: string): void {
  const files = listRelativeFiles(rootDir);
  for (const relativePath of files) {
    const fileName = path.basename(relativePath);
    if (
      relativePath.endsWith('.map') ||
      fileName === '.DS_Store' ||
      fileName === 'Thumbs.db' ||
      fileName.endsWith('.md') ||
      fileName.endsWith('.test.js')
    ) {
      throw new Error(`Disallowed file in dist-extension: ${relativePath}`);
    }
  }
}

/**
 * Package dist-extension into a Chrome Web Store submission ZIP archive under release/.
 */
function main(): void {
  const manifestPath = path.join(DIST_EXTENSION_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('dist-extension/manifest.json not found. Run npm run build:extension first.');
  }

  assertCleanExtensionOutput(DIST_EXTENSION_DIR);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ExtensionManifest;
  const slug = manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const zipFileName = `${slug}-v${manifest.version}.zip`;

  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  const zipPath = path.join(RELEASE_DIR, zipFileName);
  fs.rmSync(zipPath, { force: true });

  execFileSync('zip', ['-r', '-X', zipPath, '.'], {
    cwd: DIST_EXTENSION_DIR,
    stdio: 'inherit',
  });

  const stats = fs.statSync(zipPath);
  const sizeKb = (stats.size / 1024).toFixed(1);
  console.log(`Packaged Chrome Web Store archive: ${zipPath} (${sizeKb} KB)`);
}

main();
