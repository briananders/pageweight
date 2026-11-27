import fs from 'node:fs';
import path from 'node:path';

const EXTENSION_SRC_DIR = path.resolve('extension');
const EXTENSION_OUT_DIR = path.resolve('dist-extension');

/**
 * Copy a single static file from the extension source directory into dist-extension.
 */
function copyStaticFile(relativePath: string): void {
  const sourcePath = path.join(EXTENSION_SRC_DIR, relativePath);
  const destinationPath = path.join(EXTENSION_OUT_DIR, relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

/**
 * Copy all files within a static subdirectory into dist-extension.
 */
function copyStaticDirectory(relativeDir: string): void {
  const sourceDir = path.join(EXTENSION_SRC_DIR, relativeDir);
  const destinationDir = path.join(EXTENSION_OUT_DIR, relativeDir);
  fs.mkdirSync(destinationDir, { recursive: true });

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      fs.copyFileSync(
        path.join(sourceDir, entry.name),
        path.join(destinationDir, entry.name)
      );
    }
  }
}

/**
 * Stage static manifest, icon, and sidepanel assets into the compiled extension directory.
 */
function main(): void {
  copyStaticFile('manifest.json');
  copyStaticDirectory('icons');
  copyStaticDirectory('sidepanel');
}

main();
