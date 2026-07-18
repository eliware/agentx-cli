import { createInterface } from 'node:readline/promises';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getHomeDirectory } from './platform.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const homeDirectory = getHomeDirectory();
/* istanbul ignore next -- root fallback is only relevant on platforms without a home directory. */
const envPath = path.join(homeDirectory || rootDir, '.agentx');

const DEFAULTS = {
  AGENTX_MODEL: 'gpt-5.6-luna',
  AGENTX_REASONING_MODE: 'standard',
  AGENTX_REASONING_EFFORT: 'low',
  AGENTX_REASONING_SUMMARY: 'auto',
  AGENTX_OUTPUT_VERBOSITY: 'low',
  AGENTX_COMPACTION_THRESHOLD: '200000',
  AGENTX_MCP_SERVERS: '[]',
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
function parseMcpServers(value) {
  try { return JSON.parse(value || '[]'); } catch { return []; }
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

async function editValue(rl, envState, key, label, valuesList, stdout) {
  const current = envState.values[key];
  const input = (await ask(rl, `${label} [${current}]: `)).trim();
  if (!input) return;
  const value = valuesList.includes(input) ? input : valuesList.find((item) => item.startsWith(input));
  if (!value) { stdout.write(`Choose one of: ${valuesList.join(', ')}\n`); return; }
  envState.values[key] = value; await writeEnvState(envState.filePath, envState.values, envState.text); envState.text = await readOptionalText(envState.filePath) || '';
}
async function editApiKey(rl, envState, stdout) {
  while (true) { const input = (await ask(rl, `API key [${formatMaybeBlank(envState.values.AGENTX_API_KEY)}]: `)).trim(); const next = input || envState.values.AGENTX_API_KEY; if (!next) { stdout.write('API key is required.\n'); continue; } envState.values.AGENTX_API_KEY = next; await writeEnvState(envState.filePath, envState.values, envState.text); envState.text = await readOptionalText(envState.filePath) || ''; stdout.write('API key saved.\n'); return 'API key saved.'; }
}
async function editCompaction(rl, envState, stdout) {
  const input = (await ask(rl, `Compaction threshold tokens [${envState.values.AGENTX_COMPACTION_THRESHOLD}]: `)).trim();
  if (!input) return; const value = Number(input.replaceAll(/[^0-9]/g, '')); if (!Number.isInteger(value) || value < 1) { stdout.write('Enter a positive token count.\n'); return; }
  envState.values.AGENTX_COMPACTION_THRESHOLD = String(value); await writeEnvState(envState.filePath, envState.values, envState.text); envState.text = await readOptionalText(envState.filePath) || '';
  if (value > 270000) stdout.write('Warning: jumbo prompts cost 2x above 270k tokens.\n');
}
async function editMcp(rl, envState, stdout) {
  const servers = parseMcpServers(envState.values.AGENTX_MCP_SERVERS);
  const url = (await ask(rl, 'MCP server URL (blank to cancel): ')).trim(); if (!url) return;
  const label = (await ask(rl, 'MCP server label: ')).trim(); const description = (await ask(rl, 'MCP server description: ')).trim();
  const authType = (await ask(rl, 'Authentication [none/bearer/headers]: ')).trim().toLowerCase() || 'none';
  const server = { url, label, description, auth: { type: authType } };
  if (authType === 'bearer') server.auth.token = await ask(rl, 'Bearer token: ');
  if (authType === 'headers') { const raw = await ask(rl, 'Custom headers JSON: '); try { server.auth.headers = JSON.parse(raw); } catch { stdout.write('Invalid headers JSON; server not added.\n'); return; } }
  servers.push(server); envState.values.AGENTX_MCP_SERVERS = JSON.stringify(servers); await writeEnvState(envState.filePath, envState.values, envState.text); envState.text = await readOptionalText(envState.filePath) || ''; stdout.write('MCP server saved. Many MCP tools increase every request cost.\n');
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
    { id: 'mcp', label: 'Add MCP server' }, { id: 'quit', label: 'Quit' },
  ];
}
function renderScreen({ values, message, stdout }) { stdout.write('\x1b[2J\x1b[HAgentX setup\n'); stdout.write(`Root: ${rootDir}\nConfig: ${envPath}\nAPI key: ${values.AGENTX_API_KEY ? 'set' : 'blank'}\n`); if (message) stdout.write(`\n${message}\n`); stdout.write('\n'); }

async function selectMenu(stdin, stdout, entries) {
  if (typeof stdin.setRawMode !== 'function' || typeof stdin.on !== 'function') return null;
  let selected = 0; let buffer = '';
  const render = () => { stdout.write('\x1b[2J\x1b[HAgentX setup\n\n'); entries.forEach((entry, index) => stdout.write(`${index === selected ? '> ' : '  '}${entry.label}\n`)); };
  render(); stdin.setRawMode(true); stdin.resume();
  return await new Promise((resolve) => {
    const onData = (chunk) => {
      buffer += chunk.toString();
      if (buffer.includes('\x1b[A')) { selected = (selected + entries.length - 1) % entries.length; buffer = ''; render(); }
      else if (buffer.includes('\x1b[B')) { selected = (selected + 1) % entries.length; buffer = ''; render(); }
      else if (buffer.includes('\r') || buffer.includes('\n')) { stdin.setRawMode(false); stdin.off?.('data', onData); stdout.write('\n'); resolve(entries[selected]); }
      else if (buffer.includes('\u0003')) { stdin.setRawMode(false); stdin.off?.('data', onData); resolve(entries.find((entry) => entry.id === 'quit')); }
      else if (buffer.length > 8) buffer = buffer.slice(-8);
    };
    stdin.on('data', onData);
  });
}

export async function runSetup({ stdin = process.stdin, stdout = process.stdout } = {}) {
  const envState = await readEnvState(envPath);
  Object.assign(envState.values, DEFAULTS, envState.values);
  if (!stdin?.isTTY || !stdout?.isTTY) { stdout.write('AgentX setup requires an interactive terminal.\n'); return; }
  const rl = createInterface({ input: stdin, output: stdout }); let message = '';
  try { while (true) {
    const entries = buildMenuEntries({ values: envState.values, includeSettings: true });
    let selected = await selectMenu(stdin, stdout, entries);
    if (!selected) {
      renderScreen({ values: envState.values, message, stdout }); entries.forEach((entry, index) => stdout.write(`${index + 1}. ${entry.label}\n`));
      const choice = (await ask(rl, '\nChoose an option: ')).trim().toLowerCase(); const index = Number(choice);
      selected = Number.isInteger(index) && index >= 1 && index <= entries.length ? entries[index - 1] : entries.find((entry) => entry.id === choice || entry.label.toLowerCase() === choice);
    }
    if (!selected) { message = 'Unknown option.'; continue; } if (selected.id === 'quit') break;
    if (selected.id === 'api') message = await editApiKey(rl, envState, stdout);
    else if (selected.id === 'model') await editValue(rl, envState, 'AGENTX_MODEL', labels.model, choices.model, stdout);
    else if (selected.id === 'mode') await editValue(rl, envState, 'AGENTX_REASONING_MODE', labels.mode, choices.mode, stdout);
    else if (selected.id === 'effort') await editValue(rl, envState, 'AGENTX_REASONING_EFFORT', labels.effort, choices.effort, stdout);
    else if (selected.id === 'summary') await editValue(rl, envState, 'AGENTX_REASONING_SUMMARY', labels.summary, choices.summary, stdout);
    else if (selected.id === 'verbosity') await editValue(rl, envState, 'AGENTX_OUTPUT_VERBOSITY', labels.verbosity, choices.verbosity, stdout);
    else if (selected.id === 'compaction') await editCompaction(rl, envState, stdout);
    else await editMcp(rl, envState, stdout);
  } } finally { rl.close(); }
}

export const setupPaths = { rootDir, envPath };
export const setupInternals = { decodeEnvValue, formatMaybeBlank, parseEnvLines, parseMcpServers, serializeEnvValue, updateEnvText, buildMenuEntries, DEFAULTS, choices };
