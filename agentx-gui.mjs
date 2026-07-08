#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from './src/backend/app.mjs';

const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';
const modulePath = fs.realpathSync(fileURLToPath(import.meta.url));

if (invokedPath === modulePath) {
  try {
    await startServer();
  } catch (error) {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exit(1);
  }
}
