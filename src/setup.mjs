import { createInterface } from 'node:readline/promises';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getHomeDirectory } from './platform.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const homeDirectory = getHomeDirectory();
const envPath = path.join(homeDirectory || rootDir, '.agentx');

function formatMaybeBlank(value) {
  const text = String(value ?? '').trim();
  return text ? text : '(blank)';
}

function parseEnvLines(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  return lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) return { type: 'raw', line };
    return { type: 'pair', key: match[1], value: match[2], line };
  });
}

function serializeEnvValue(value) {
  const text = String(value ?? '');
  if (!text) return '';
  if (/^[A-Za-z0-9_\-.:/]+$/.test(text)) return text;
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function updateEnvText(text, updates) {
  const lines = String(text ?? '') === '' ? [] : parseEnvLines(text);
  const seen = new Set();
  const output = [];

  for (const line of lines) {
    if (line.type === 'pair' && Object.prototype.hasOwnProperty.call(updates, line.key)) {
      if (seen.has(line.key)) continue;
      seen.add(line.key);
      output.push(`${line.key}=${serializeEnvValue(updates[line.key])}`);
    } else {
      output.push(line.line);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) output.push(`${key}=${serializeEnvValue(value)}`);
  }

  while (output.length > 0 && output[output.length - 1] === '') output.pop();
  return `${output.join('\n')}${output.length ? '\n' : ''}`;
}

async function readOptionalText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function readEnvState(filePath = envPath) {
  let text = '';
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const values = { AGENTX_API_KEY: '' };
  for (const line of parseEnvLines(text)) {
    if (line.type === 'pair' && Object.prototype.hasOwnProperty.call(values, line.key)) {
      values[line.key] = line.value.trim();
    }
  }
  return { filePath, text, values };
}

export async function writeEnvState(filePath, values, baseText = null) {
  const text = baseText === null ? await readOptionalText(filePath) : baseText;
  const nextText = updateEnvText(text ?? '', { AGENTX_API_KEY: values.AGENTX_API_KEY });
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, nextText, 'utf8');
  return nextText;
}

async function ask(rl, prompt) {
  return String(await rl.question(prompt));
}

async function editApiKey(rl, envState, stdout = process.stdout) {
  while (true) {
    const input = (await ask(rl, `API key [${formatMaybeBlank(envState.values.AGENTX_API_KEY)}]: `)).trim();
    const nextValue = input || envState.values.AGENTX_API_KEY;
    if (!nextValue) {
      stdout.write('API key is required.\n');
      continue;
    }
    envState.values.AGENTX_API_KEY = nextValue;
    await writeEnvState(envState.filePath, envState.values, envState.text);
    envState.text = await readOptionalText(envState.filePath) || '';
    stdout.write('API key saved.\n');
    return 'API key saved.';
  }
}

function buildMenuEntries({ values }) {
  return [
    { id: 'api', label: `Edit API key (${values.AGENTX_API_KEY ? 'set' : 'blank'})` },
    { id: 'quit', label: 'Quit' },
  ];
}

function renderScreen({ values, message, stdout = process.stdout }) {
  stdout.write('\x1b[2J\x1b[H');
  stdout.write('AgentX setup\n');
  stdout.write(`Root: ${rootDir}\n`);
  stdout.write(`Config: ${envPath}\n`);
  stdout.write(`API key: ${values.AGENTX_API_KEY ? 'set' : 'blank'}\n`);
  if (message) stdout.write(`\n${message}\n`);
  stdout.write('\n');
}

export async function runSetup({ stdin = process.stdin, stdout = process.stdout } = {}) {
  const envState = await readEnvState(envPath);
  if (!stdin?.isTTY || !stdout?.isTTY) {
    stdout.write('AgentX setup requires an interactive terminal.\n');
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  let message = '';
  try {
    while (true) {
      const entries = buildMenuEntries({ values: envState.values });
      renderScreen({ values: envState.values, message, stdout });
      entries.forEach((entry, index) => stdout.write(`${index + 1}. ${entry.label}\n`));
      const choice = (await ask(rl, '\nChoose an option: ')).trim().toLowerCase();
      const index = Number(choice);
      const selected = Number.isInteger(index) && index >= 1 && index <= entries.length
        ? entries[index - 1]
        : entries.find((entry) => entry.id === choice || entry.label.toLowerCase() === choice);
      if (!selected) {
        message = 'Unknown option.';
        continue;
      }
      if (selected.id === 'quit') break;
      if (selected.id === 'api') message = await editApiKey(rl, envState, stdout);
    }
  } finally {
    rl.close();
  }
}

export const setupPaths = { rootDir, envPath };
export const setupInternals = {
  formatMaybeBlank,
  parseEnvLines,
  serializeEnvValue,
  updateEnvText,
  buildMenuEntries,
};
