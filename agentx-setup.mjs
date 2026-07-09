#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { runSetup } from './src/setup.mjs';

const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';
const modulePath = fs.realpathSync(fileURLToPath(import.meta.url));

if (invokedPath === modulePath) {
  try {
    await runSetup({ cwd: process.cwd() });
  } catch (error) {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exit(1);
  }
}
