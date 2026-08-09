#!/usr/bin/env node

const requiredFiles = [
  'LICENSE',
  'README.md',
  'RELEASE_NOTES.md',
  'agentx.mjs',
  'agentx-setup.mjs',
  'package.json',
  'prompt.json',
  'src/agent.mjs'
];
const forbiddenPatterns = [
  /(^|\/)tests\//,
  /(^|\/)coverage\//,
  /(^|\/)node_modules\//,
  /(^|\/)\.agentx/,
  /(^|\/)\.env(?:\.|$)/,
  /\.tgz$/
];

const input = await new Promise((resolve, reject) => {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { data += chunk; });
  process.stdin.on('end', () => resolve(data));
  process.stdin.on('error', reject);
});

let report;
try {
  report = JSON.parse(input);
} catch (error) {
  console.error(`Invalid npm pack report: ${error.message}`);
  process.exitCode = 1;
}

if (!report) process.exit();
const packageReport = Object.values(report)[0];
const files = packageReport?.files?.map(file => file.path) ?? [];
const missing = requiredFiles.filter(file => !files.includes(file));
const forbidden = files.filter(file => forbiddenPatterns.some(pattern => pattern.test(file)));

if (missing.length || forbidden.length) {
  if (missing.length) console.error(`Missing package files: ${missing.join(', ')}`);
  if (forbidden.length) console.error(`Forbidden package files: ${forbidden.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`Package artifact valid: ${packageReport.name}@${packageReport.version} (${files.length} files)`);
}
