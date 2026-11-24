#!/usr/bin/env node

import { runCli } from '../cli.ts';

/**
 * Execute the CLI entrypoint and propagate its exit code to Node.
 */
async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv);
}

void main();
