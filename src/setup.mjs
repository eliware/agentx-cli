import { createInterface } from 'node:readline/promises';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { getHomeDirectory } from './platform.mjs';
import { reloadSettings } from './settings.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageVersion = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;
const homeDirectory = getHomeDirectory();
/* istanbul ignore next -- root fallback is only relevant on platforms without a home directory. */
const envPath = path.join(homeDirectory || rootDir, '.agentx');
const mcpConfigPath = path.join(homeDirectory || rootDir, '.agentx.mcp.json');

const DEFAULTS = {
  AGENTX_MODEL: 'gpt-5.6-luna',
  AGENTX_REASONING_MODE: 'standard',
  AGENTX_REASONING_EFFORT: 'low',
  AGENTX_REASONING_SUMMARY: 'auto',
  AGENTX_OUTPUT_VERBOSITY: 'low',
  AGENTX_COMPACTION_THRESHOLD: '200000',
};

function formatMaybeBlank(value) { const text = String(value ?? '').trim(); return text ? text : '(blank)'; }
function decodeEnvValue(value) {
  const text = String(value ?? '').trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try { return JSON.parse(text); } catch { return text.slice(1, -1); }
  }
  return text;
}
function parseEnvLines(text) {
  return String(text ?? '').split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    return match ? { type: 'pair', key: match[1], value: match[2], line } : { type: 'raw', line };
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
  const seen = new Set(); const output = [];
  for (const line of lines) {
    if (line.type === 'pair' && Object.prototype.hasOwnProperty.call(updates, line.key)) {
      if (seen.has(line.key)) continue;
      seen.add(line.key); output.push(`${line.key}=${serializeEnvValue(updates[line.key])}`);
    } else output.push(line.line);
  }
  for (const [key, value] of Object.entries(updates)) if (!seen.has(key)) output.push(`${key}=${serializeEnvValue(value)}`);
  while (output.at(-1) === '') output.pop();
  return `${output.join('\n')}${output.length ? '\n' : ''}`;
}
/* istanbul ignore next -- filesystem failures are delegated to the caller. */
async function readOptionalText(filePath) { try { return await readFile(filePath, 'utf8'); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; } }

export async function readEnvState(filePath = envPath) {
  let text = ''; try { text = await readFile(filePath, 'utf8'); } catch (error) { /* istanbul ignore next -- missing config is the normal path. */ if (error?.code !== 'ENOENT') throw error; }
  const values = { AGENTX_API_KEY: '' };
  const knownKeys = new Set(['AGENTX_API_KEY', ...Object.keys(DEFAULTS)]);
  for (const line of parseEnvLines(text)) if (line.type === 'pair' && knownKeys.has(line.key)) values[line.key] = decodeEnvValue(line.value);
  return { filePath, text, values };
}
export async function writeEnvState(filePath, values, baseText = null) {
  /* istanbul ignore next -- explicit base text is an internal/test override. */
  const text = baseText === null ? await readOptionalText(filePath) : baseText;
  const updates = Object.fromEntries(Object.keys(values).map((key) => [key, values[key]]));
  const nextText = updateEnvText(text ?? '', updates);
  await mkdir(path.dirname(filePath), { recursive: true }); await writeFile(filePath, nextText, 'utf8'); return nextText;
}
async function ask(rl, prompt) { return String(await rl.question(prompt)); }

const choices = {
  model: ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'],
  mode: ['standard', 'pro'], effort: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  summary: ['concise', 'detailed', 'auto', 'null'], verbosity: ['low', 'medium', 'high'],
};
const labels = { model: 'Model', mode: 'Reasoning mode', effort: 'Reasoning effort', summary: 'Reasoning summary', verbosity: 'Output verbosity' };

async function saveEnvValue(envState, key, value) {
  envState.values[key] = value;
  await writeEnvState(envState.filePath, envState.values, envState.text);
  /* A successful write above guarantees the file exists. */
  envState.text = await readOptionalText(envState.filePath);
}

async function selectChoice(stdin, stdout, rl, title, valuesList, current) {
  const entries = valuesList.map((value) => ({ id: value, label: `${value}${value === current ? ' (current)' : ''}` }));
  stdout.write(`\x1b[2J\x1b[HAgentX ${packageVersion} Setup\n\n${title}\n`);
  const currentIndex = entries.findIndex((entry) => entry.id === current);
  const selected = await selectMenu(stdin, stdout, entries, currentIndex >= 0 ? currentIndex : 0, { rootDir, envPath });
  if (selected) return selected.id;
  const answer = (await ask(rl, `${title} (1-${entries.length}) [${current}]: `)).trim();
  const index = Number(answer);
  if (Number.isInteger(index) && index >= 1 && index <= entries.length) return entries[index - 1].id;
  return entries.find((entry) => entry.id === answer || entry.id.startsWith(answer) || entry.label.toLowerCase().startsWith(answer.toLowerCase()))?.id ?? null;
}

async function editValue(stdin, stdout, rl, envState, key, label, valuesList) {
  const value = await selectChoice(stdin, stdout, rl, label, valuesList, envState.values[key]);
  if (value && value !== envState.values[key]) await saveEnvValue(envState, key, value);
}
async function editApiKey(rl, envState, stdout) {
  while (true) { const input = (await ask(rl, `API key [${formatMaybeBlank(envState.values.AGENTX_API_KEY)}]: `)).trim(); const next = input || envState.values.AGENTX_API_KEY; if (!next) { stdout.write('API key is required.\n'); continue; } await saveEnvValue(envState, 'AGENTX_API_KEY', next); stdout.write('API key saved.\n'); return 'API key saved.'; }
}
async function editCompaction(rl, envState, stdout) {
  const input = (await ask(rl, `Compaction threshold tokens [${envState.values.AGENTX_COMPACTION_THRESHOLD}]: `)).trim();
  if (!input) return; const value = Number(input.replaceAll(/[^0-9]/g, '')); if (!Number.isInteger(value) || value < 1) { stdout.write('Enter a positive token count.\n'); return; }
  await saveEnvValue(envState, 'AGENTX_COMPACTION_THRESHOLD', String(value)); if (value > 270000) stdout.write('Warning: jumbo prompts cost 2x above 270k tokens.\n');
}
export function buildMenuEntries({ values, includeSettings = false }) {
  const configured = { ...DEFAULTS, ...values };
  if (!includeSettings && !Object.keys(values).some((key) => key !== 'AGENTX_API_KEY')) return [
    { id: 'api', label: `Edit API key (${configured.AGENTX_API_KEY ? 'set' : 'blank'})` }, { id: 'quit', label: 'Quit' },
  ];
  return [
    { id: 'api', label: `Edit API key (${configured.AGENTX_API_KEY ? 'set' : 'blank'})` },
    { id: 'model', label: `Model (${configured.AGENTX_MODEL})` }, { id: 'mode', label: `Reasoning mode (${configured.AGENTX_REASONING_MODE})` },
    { id: 'effort', label: `Reasoning effort (${configured.AGENTX_REASONING_EFFORT})` }, { id: 'summary', label: `Reasoning summary (${configured.AGENTX_REASONING_SUMMARY})` },
    { id: 'verbosity', label: `Output verbosity (${configured.AGENTX_OUTPUT_VERBOSITY})` }, { id: 'compaction', label: `Compaction threshold (${configured.AGENTX_COMPACTION_THRESHOLD} tokens)` },
    { id: 'quit', label: 'Quit' },
  ];
}
function renderScreen({ values, message, stdout, configPath = envPath, mcpPath = mcpConfigPath }) { stdout.write(`\x1b[2J\x1b[HAgentX ${packageVersion} Setup\n\n`); stdout.write(`Install Path: ${rootDir}\nConfig File: ${configPath}\nMCP Config: ${mcpPath}\nAPI key: ${values.AGENTX_API_KEY ? 'set' : 'blank'}\n`); if (message) stdout.write(`\n${message}\n`); stdout.write('\n'); }

async function selectMenu(stdin, stdout, entries, initialIndex = 0, paths = {}) {
  if (typeof stdin.setRawMode !== 'function' || typeof stdin.on !== 'function') return null;
  let selected = Number.isInteger(initialIndex) && initialIndex >= 0 && initialIndex < entries.length ? initialIndex : 0; let buffer = '';
  const render = () => { stdout.write(`\x1b[2J\x1b[HAgentX ${packageVersion} Setup\n\n`); if (paths.rootDir || paths.envPath || paths.mcpPath) stdout.write(`Install Path: ${paths.rootDir ?? rootDir}\nConfig File: ${paths.envPath ?? envPath}\nMCP Config: ${paths.mcpPath ?? mcpConfigPath}\n\n`); entries.forEach((entry, index) => stdout.write(`${index === selected ? '> ' : '  '}${index + 1}. ${entry.label}\n`)); stdout.write(`\nUse 1-${entries.length}, ↑/↓, or Enter.\n`); };
  render(); stdin.setRawMode(true); stdin.resume();
  return await new Promise((resolve) => {
    const onData = (chunk) => {
      buffer += chunk.toString();
      if (buffer.includes('\x1b[A')) { selected = (selected + entries.length - 1) % entries.length; buffer = ''; render(); }
      else if (buffer.includes('\x1b[B')) { selected = (selected + 1) % entries.length; buffer = ''; render(); }
      else if (/^[1-9]$/.test(buffer) && Number(buffer) <= entries.length) {
        selected = Number(buffer) - 1;
        buffer = '';
        stdin.setRawMode(false);
        stdin.off?.('data', onData);
        stdout.write('\n');
        resolve(entries[selected]);
      }
      else if (buffer.includes('\r') || buffer.includes('\n')) { stdin.setRawMode(false); stdin.off?.('data', onData); stdout.write('\n'); resolve(entries[selected]); }
      else if (buffer.includes('\u0003')) { stdin.setRawMode(false); stdin.off?.('data', onData); resolve(entries.find((entry) => entry.id === 'quit')); }
      else buffer = buffer.length > 8 ? buffer.slice(-8) : buffer;
    };
    stdin.on('data', onData);
  });
}

export async function runSetup({ stdin = process.stdin, stdout = process.stdout, configPath = envPath, readlineInput = stdin } = {}) {
  const envState = await readEnvState(configPath);
  Object.assign(envState.values, DEFAULTS, envState.values);
  if (!stdin?.isTTY || !stdout?.isTTY) { stdout.write('AgentX setup requires an interactive terminal.\n'); return; }
  const rl = createInterface({ input: readlineInput, output: stdout }); let message = '';
  try { while (true) {
    const entries = buildMenuEntries({ values: envState.values, includeSettings: true });
    let selected = await selectMenu(stdin, stdout, entries, 0, { rootDir, envPath: configPath, mcpPath: mcpConfigPath });
    if (!selected) {
      renderScreen({ values: envState.values, message, stdout, configPath, mcpPath: mcpConfigPath }); entries.forEach((entry, index) => stdout.write(`${index + 1}. ${entry.label}\n`)); stdout.write(`\nUse 1-${entries.length}, ↑/↓, or Enter.\n`);
      const choice = (await ask(rl, '\nChoose an option: ')).trim().toLowerCase(); const index = Number(choice);
      selected = Number.isInteger(index) && index >= 1 && index <= entries.length ? entries[index - 1] : entries.find((entry) => entry.id === choice || entry.label.toLowerCase() === choice);
    }
    if (!selected) { message = 'Unknown option.'; continue; } if (selected.id === 'quit') break;
    switch (selected.id) {
      case 'api': message = await editApiKey(rl, envState, stdout); break;
      case 'model': await editValue(stdin, stdout, rl, envState, 'AGENTX_MODEL', labels.model, choices.model); break;
      case 'mode': await editValue(stdin, stdout, rl, envState, 'AGENTX_REASONING_MODE', labels.mode, choices.mode); break;
      case 'effort': await editValue(stdin, stdout, rl, envState, 'AGENTX_REASONING_EFFORT', labels.effort, choices.effort); break;
      case 'summary': await editValue(stdin, stdout, rl, envState, 'AGENTX_REASONING_SUMMARY', labels.summary, choices.summary); break;
      case 'verbosity': await editValue(stdin, stdout, rl, envState, 'AGENTX_OUTPUT_VERBOSITY', labels.verbosity, choices.verbosity); break;
      case 'compaction': await editCompaction(rl, envState, stdout); break;
    }
  } } finally { rl.close(); }
  // Reload environment variables so subsequent code sees updated values.
  await reloadSettings();
}

export const setupPaths = { rootDir, envPath, mcpConfigPath };
export const setupInternals = { decodeEnvValue, formatMaybeBlank, parseEnvLines, serializeEnvValue, updateEnvText, buildMenuEntries, renderScreen, selectMenu, selectChoice, DEFAULTS, choices };
