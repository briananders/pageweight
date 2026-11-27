import fs from 'node:fs';
import path from 'node:path';

const BIN_PATH = path.resolve('dist', 'bin', 'pageweight.js');
const EXPECTED_SHEBANG = '#!/usr/bin/env node';

/**
 * Ensure the compiled CLI entrypoint exists, retains its Node shebang, and is executable.
 */
function main(): void {
  if (!fs.existsSync(BIN_PATH)) {
    throw new Error(`Compiled CLI entrypoint not found: ${BIN_PATH}`);
  }

  const contents = fs.readFileSync(BIN_PATH, 'utf-8');
  if (!contents.startsWith(EXPECTED_SHEBANG)) {
    throw new Error(`Compiled CLI entrypoint is missing shebang "${EXPECTED_SHEBANG}".`);
  }

  // Mark the compiled CLI binary executable so npm packs and links it with 0755 permissions.
  fs.chmodSync(BIN_PATH, 0o755);
}

main();
