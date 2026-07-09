import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 3100;
const DEFAULT_HOST = '0.0.0.0';
const SERVICE_NAME = 'agentx-gui.service';
const SERVICE_TEMPLATE_NAME = 'agentx-gui.service';
const SYSTEMD_UNIT_PATH = '/usr/lib/systemd/system/agentx-gui.service';
const INSTALL_ROOT = '/opt/agentx-cli';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(rootDir, '.env');
const serviceTemplatePath = path.join(rootDir, SERVICE_TEMPLATE_NAME);

function formatMaybeBlank(value) {
  const text = String(value ?? '').trim();
  return text ? text : '(blank)';
}

function formatBoolWord(value, yesWord, noWord) {
  return value ? yesWord : noWord;
}

function formatBytes(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return '-';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let scaled = size;
  let index = 0;
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index += 1;
  }
  return `${scaled.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const seconds = Math.floor(total / 1000) % 60;
  const minutes = Math.floor(total / 60000) % 60;
  const hours = Math.floor(total / 3600000);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

function formatCpuTime(ns) {
  let value;
  try {
    value = typeof ns === 'bigint' ? ns : BigInt(String(ns || '0').trim() || '0');
  } catch {
    return '-';
  }
  const totalSeconds = value / 1_000_000_000n;
  const seconds = Number(totalSeconds % 60n);
  const minutes = Number((totalSeconds / 60n) % 60n);
  const hours = Number(totalSeconds / 3600n);
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseEnvLines(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  return lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      return { type: 'raw', line };
    }
    return { type: 'pair', key: match[1], value: match[2], line };
  });
}

function serializeEnvValue(value) {
  const text = String(value ?? '');
  if (!text) return '';
  if (/^[A-Za-z0-9_\-.:\/]+$/.test(text)) return text;
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function updateEnvText(text, updates) {
  const lines = parseEnvLines(text);
  const seen = new Set();
  const output = [];

  for (const line of lines) {
    if (line.type === 'pair' && Object.prototype.hasOwnProperty.call(updates, line.key)) {
      if (seen.has(line.key)) continue;
      seen.add(line.key);
      output.push(`${line.key}=${serializeEnvValue(updates[line.key])}`);
      continue;
    }
    output.push(line.line);
  }

  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) continue;
    output.push(`${key}=${serializeEnvValue(value)}`);
  }

  while (output.length > 0 && output[output.length - 1] === '') {
    output.pop();
  }

  return `${output.join('\n')}${output.length ? '\n' : ''}`;
}

export async function readEnvState(filePath = envPath) {
  let text = '';
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const lines = parseEnvLines(text);
  const values = Object.fromEntries([
    ['AGENTX_API_KEY', ''],
    ['HOST', DEFAULT_HOST],
    ['PORT', String(DEFAULT_PORT)],
  ]);

  for (const line of lines) {
    if (line.type !== 'pair') continue;
    if (Object.prototype.hasOwnProperty.call(values, line.key)) {
      values[line.key] = line.value.replace(/^\s+|\s+$/g, '');
    }
  }

  return { filePath, text, values };
}

export async function writeEnvState(filePath, values, baseText = null) {
  const text = baseText === null ? await readOptionalText(filePath) : baseText;
  const nextText = updateEnvText(text ?? '', values);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, nextText, 'utf8');
  return nextText;
}

async function readOptionalText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function validateHost(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return { ok: false, message: 'HOST is required.' };
  }
  if (['0.0.0.0', '127.0.0.1', '::', '::1'].includes(text)) {
    return { ok: true, value: text };
  }
  if (net.isIP(text)) {
    return { ok: true, value: text };
  }
  return { ok: false, message: 'HOST must be an IP address such as 0.0.0.0, 127.0.0.1, ::, or ::1.' };
}

export function validatePort(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return { ok: false, message: 'PORT is required.' };
  }
  if (!/^\d+$/.test(text)) {
    return { ok: false, message: 'PORT must be a number between 1 and 65535.' };
  }
  const number = Number(text);
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    return { ok: false, message: 'PORT must be a number between 1 and 65535.' };
  }
  return { ok: true, value: String(number) };
}

export function detectSystemdAvailability() {
  if (!existsSync('/run/systemd/system')) return false;
  const result = spawnSync('systemctl', ['--version'], { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

function runSystemctl(args, { allowFailure = false } = {}) {
  const result = spawnSync('systemctl', args, { encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
  if (!allowFailure && result.status !== 0) {
    const message = String(result.stderr || result.stdout || `systemctl ${args.join(' ')} failed`).trim();
    throw new Error(message || `systemctl ${args.join(' ')} failed`);
  }
  return result;
}

function readServiceText(root = rootDir) {
  return readFile(path.join(root, SERVICE_TEMPLATE_NAME), 'utf8');
}

export async function buildServiceUnit(root = INSTALL_ROOT) {
  const templateRoot = root === INSTALL_ROOT ? rootDir : root;
  const template = await readServiceText(templateRoot);
  return template.split(INSTALL_ROOT).join(root);
}

export async function writeServiceUnit(root = INSTALL_ROOT, targetPath = SYSTEMD_UNIT_PATH) {
  const unitText = await buildServiceUnit(root);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, unitText, 'utf8');
  return unitText;
}

export function isServiceInstalled(targetPath = SYSTEMD_UNIT_PATH) {
  return existsSync(targetPath);
}

export function getServiceName() {
  return SERVICE_NAME;
}

export function getServiceUnitPath() {
  return SYSTEMD_UNIT_PATH;
}

export function getSetupRootDir() {
  return rootDir;
}

export async function ensureServiceInstalled(root = INSTALL_ROOT, targetPath = SYSTEMD_UNIT_PATH) {
  const unitText = await writeServiceUnit(root, targetPath);
  runSystemctl(['daemon-reload']);
  return unitText;
}

export async function repairService(root = INSTALL_ROOT, targetPath = SYSTEMD_UNIT_PATH) {
  return ensureServiceInstalled(root, targetPath);
}

export async function startService() {
  runSystemctl(['start', SERVICE_NAME]);
}

export async function stopService() {
  runSystemctl(['stop', SERVICE_NAME]);
}

export async function restartService() {
  runSystemctl(['restart', SERVICE_NAME]);
}

export async function enableService() {
  runSystemctl(['enable', SERVICE_NAME]);
}

export async function disableService() {
  runSystemctl(['disable', SERVICE_NAME]);
}

export async function uninstallService(targetPath = SYSTEMD_UNIT_PATH) {
  try {
    runSystemctl(['stop', SERVICE_NAME], { allowFailure: true });
  } catch {
    // ignore stop failures during uninstall
  }
  try {
    runSystemctl(['disable', SERVICE_NAME], { allowFailure: true });
  } catch {
    // ignore disable failures during uninstall
  }
  try {
    await unlink(targetPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  runSystemctl(['daemon-reload']);
}

function parseSystemctlProperties(output) {
  const properties = {};
  for (const line of String(output || '').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    properties[key] = value;
  }
  return properties;
}

function extractLastUsefulLogLine(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trimEnd());
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (/^(Loaded|Active|Docs|Main PID|Tasks|Memory|CPU|CGroup|Process|Hint:|Warning:)/.test(line)) continue;
    if (line.includes(SERVICE_NAME) || line.includes('listening')) return line;
    if (/^[A-Z][a-z]{2}\s+\d+/.test(line)) return line;
  }
  return '';
}

export function formatServiceStatusSummary(state) {
  const activity = state.running ? 'active / running' : `${state.activeState || 'inactive'} / ${state.subState || 'dead'}`;
  const statusLine = `${activity} / ${state.enabled ? 'enabled' : 'disabled'} / ${state.running ? 'success' : 'error'}`;
  const lines = [
    `Service: ${statusLine}`,
    `Installed: ${formatBoolWord(state.installed, 'yes', 'no')}`,
    `Enabled: ${formatBoolWord(state.enabled, 'yes', 'no')}`,
    `PID: ${state.pid || '-'}`,
    `Uptime: ${state.uptime || '-'}`,
    `CPU: ${state.cpu || '-'}`,
    `Memory: ${state.memory || '-'}`,
    `Last log: ${state.lastLog || '-'}`,
  ];
  return lines.join('\n');
}

export async function readServiceStatus(targetPath = SYSTEMD_UNIT_PATH) {
  const installed = isServiceInstalled(targetPath);
  if (!installed) {
    return {
      installed: false,
      enabled: false,
      running: false,
      pid: null,
      uptime: '',
      cpu: '',
      memory: '',
      lastLog: '',
      activeState: 'inactive',
      subState: 'dead',
      unitFileState: 'disabled',
    };
  }

  const showResult = runSystemctl([
    'show',
    SERVICE_NAME,
    '--property=LoadState',
    '--property=ActiveState',
    '--property=SubState',
    '--property=UnitFileState',
    '--property=MainPID',
    '--property=CPUUsageNSec',
    '--property=MemoryCurrent',
    '--property=ActiveEnterTimestamp',
  ], { allowFailure: true });

  const properties = parseSystemctlProperties(showResult.stdout);
  const statusResult = runSystemctl([
    'status',
    SERVICE_NAME,
    '--no-pager',
    '--full',
    '--lines=20',
  ], { allowFailure: true });

  const activeState = properties.ActiveState || 'inactive';
  const subState = properties.SubState || 'dead';
  const unitFileState = properties.UnitFileState || 'disabled';
  const running = activeState === 'active' && subState === 'running';
  const enabled = String(unitFileState).startsWith('enabled');
  const pid = Number(properties.MainPID || 0) || null;
  const startedAt = properties.ActiveEnterTimestamp ? Date.parse(properties.ActiveEnterTimestamp) : Number.NaN;
  const uptime = running && Number.isFinite(startedAt) ? formatDuration(Date.now() - startedAt) : '';
  const cpu = properties.CPUUsageNSec ? formatCpuTime(properties.CPUUsageNSec) : '';
  const memory = properties.MemoryCurrent ? formatBytes(Number(properties.MemoryCurrent)) : '';
  const lastLog = extractLastUsefulLogLine(`${statusResult.stdout || ''}\n${statusResult.stderr || ''}`);

  return {
    installed: true,
    enabled,
    running,
    pid,
    uptime,
    cpu,
    memory,
    lastLog,
    activeState,
    subState,
    unitFileState,
  };
}

function buildMenuEntries({ values, systemdAvailable, serviceStatus }) {
  const entries = [
    { id: 'api', label: `Edit API key (${values.AGENTX_API_KEY ? 'set' : 'blank'})` },
    { id: 'host', label: `Edit HOST (${values.HOST || DEFAULT_HOST})` },
    { id: 'port', label: `Edit PORT (${values.PORT || DEFAULT_PORT})` },
  ];

  if (systemdAvailable) {
    if (!serviceStatus.installed) {
      entries.push({ id: 'install', label: 'Install service' });
    } else {
      entries.push({ id: 'repair', label: 'Repair service' });
      entries.push({ id: 'uninstall', label: 'Uninstall service' });
      if (!serviceStatus.running) entries.push({ id: 'start', label: 'Start service' });
      if (serviceStatus.running) entries.push({ id: 'stop', label: 'Stop service' });
      if (serviceStatus.running) entries.push({ id: 'restart', label: 'Restart service' });
      if (!serviceStatus.enabled) entries.push({ id: 'enable', label: 'Enable at boot' });
      if (serviceStatus.enabled) entries.push({ id: 'disable', label: 'Disable at boot' });
    }
    entries.push({ id: 'status', label: 'Check status' });
  }

  entries.push({ id: 'quit', label: 'Quit' });
  return entries;
}

function renderScreen({ values, systemdAvailable, serviceStatus, message, stdout = process.stdout }) {
  stdout.write('\x1b[2J\x1b[H');
  stdout.write('AgentX setup\n');
  stdout.write(`Root: ${rootDir}\n`);
  stdout.write(`.env: ${envPath}\n`);
  stdout.write(`API key: ${values.AGENTX_API_KEY ? 'set' : 'blank'}\n`);
  stdout.write(`HOST: ${values.HOST || DEFAULT_HOST}\n`);
  stdout.write(`PORT: ${values.PORT || DEFAULT_PORT}\n`);
  stdout.write(`Systemd: ${systemdAvailable ? 'available' : 'unavailable'}\n`);
  if (!systemdAvailable) {
    stdout.write('Run npm run start:gui to launch the web UI manually.\n');
  } else if (serviceStatus.installed) {
    stdout.write(`Service: ${serviceStatus.running ? 'running' : 'stopped'} / ${serviceStatus.enabled ? 'enabled' : 'disabled'}\n`);
  } else {
    stdout.write('Service: not installed\n');
  }
  if (message) {
    stdout.write(`\n${message}\n`);
  }
  stdout.write('\n');
}

async function ask(rl, prompt) {
  return String(await rl.question(prompt));
}

async function pause(rl) {
  await rl.question('Press Enter to continue...');
}

async function editApiKey(rl, envState, stdout = process.stdout) {
  while (true) {
    const prompt = `API key [${formatMaybeBlank(envState.values.AGENTX_API_KEY)}]: `;
    const input = (await ask(rl, prompt)).trim();
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

async function editHost(rl, envState, stdout = process.stdout) {
  while (true) {
    const prompt = `HOST [${envState.values.HOST || DEFAULT_HOST}]: `;
    const input = (await ask(rl, prompt)).trim();
    const candidate = input || envState.values.HOST || DEFAULT_HOST;
    const check = validateHost(candidate);
    if (!check.ok) {
      stdout.write(`${check.message}\n`);
      continue;
    }
    envState.values.HOST = check.value;
    await writeEnvState(envState.filePath, envState.values, envState.text);
    envState.text = await readOptionalText(envState.filePath) || '';
    stdout.write('HOST saved.\n');
    return 'HOST saved.';
  }
}

async function editPort(rl, envState, stdout = process.stdout) {
  while (true) {
    const prompt = `PORT [${envState.values.PORT || DEFAULT_PORT}]: `;
    const input = (await ask(rl, prompt)).trim();
    const candidate = input || envState.values.PORT || String(DEFAULT_PORT);
    const check = validatePort(candidate);
    if (!check.ok) {
      stdout.write(`${check.message}\n`);
      continue;
    }
    envState.values.PORT = check.value;
    await writeEnvState(envState.filePath, envState.values, envState.text);
    envState.text = await readOptionalText(envState.filePath) || '';
    stdout.write('PORT saved.\n');
    return 'PORT saved.';
  }
}

function actionMessage(label) {
  return `${label}.`;
}

async function handleStatus(stdout = process.stdout) {
  const status = await readServiceStatus();
  stdout.write(`${formatServiceStatusSummary(status)}\n`);
}

export async function runSetup({ cwd = process.cwd(), stdin = process.stdin, stdout = process.stdout } = {}) {
  const systemdAvailable = detectSystemdAvailability();
  const envState = await readEnvState(envPath);
  let message = '';

  if (!stdin?.isTTY || !stdout?.isTTY) {
    stdout.write('AgentX setup requires an interactive terminal.\n');
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const serviceStatus = systemdAvailable ? await readServiceStatus() : { installed: false, running: false, enabled: false };
      const entries = buildMenuEntries({ values: envState.values, systemdAvailable, serviceStatus });

      renderScreen({ values: envState.values, systemdAvailable, serviceStatus, message, stdout });
      entries.forEach((entry, index) => {
        stdout.write(`${index + 1}. ${entry.label}\n`);
      });

      const choice = (await ask(rl, '\nChoose an option: ')).trim().toLowerCase();
      const index = Number(choice);
      const selected = Number.isInteger(index) && index >= 1 && index <= entries.length ? entries[index - 1] : entries.find((entry) => entry.id === choice || entry.label.toLowerCase() === choice);
      if (!selected) {
        message = 'Unknown option.';
        continue;
      }

      message = '';
      if (selected.id === 'quit') {
        break;
      }
      if (selected.id === 'api') {
        message = await editApiKey(rl, envState, stdout);
      } else if (selected.id === 'host') {
        message = await editHost(rl, envState, stdout);
      } else if (selected.id === 'port') {
        message = await editPort(rl, envState, stdout);
      } else if (selected.id === 'install') {
        await ensureServiceInstalled();
        message = actionMessage('Service installed and daemon reloaded');
      } else if (selected.id === 'repair') {
        await repairService();
        message = actionMessage('Service repaired and daemon reloaded');
      } else if (selected.id === 'uninstall') {
        await uninstallService(SYSTEMD_UNIT_PATH);
        message = actionMessage('Service uninstalled');
      } else if (selected.id === 'start') {
        await startService();
        message = actionMessage('Service started');
      } else if (selected.id === 'stop') {
        await stopService();
        message = actionMessage('Service stopped');
      } else if (selected.id === 'restart') {
        await restartService();
        message = actionMessage('Service restarted');
      } else if (selected.id === 'enable') {
        await enableService();
        message = actionMessage('Service enabled');
      } else if (selected.id === 'disable') {
        await disableService();
        message = actionMessage('Service disabled');
      } else if (selected.id === 'status') {
        stdout.write('\x1b[2J\x1b[H');
        await handleStatus(stdout);
        await pause(rl);
        message = '';
      }
    }
  } finally {
    rl.close();
  }
}

export const setupPaths = {
  rootDir,
  envPath,
  serviceTemplatePath,
  systemdUnitPath: SYSTEMD_UNIT_PATH,
};

export const setupInternals = {
  formatMaybeBlank,
  parseEnvLines,
  serializeEnvValue,
  updateEnvText,
  readServiceText,
  buildMenuEntries,
  extractLastUsefulLogLine,
  parseSystemctlProperties,
  formatBytes,
  formatDuration,
  formatCpuTime,
};
