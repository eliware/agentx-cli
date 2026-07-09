import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import path from 'node:path';

const fileMap = new Map();
const spawnSync = jest.fn();
const existsSync = jest.fn();
const readFile = jest.fn();
const writeFile = jest.fn();
const mkdir = jest.fn();
const unlink = jest.fn();
const createInterface = jest.fn();

function makeMissingError(filePath) {
  const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
  error.code = 'ENOENT';
  return error;
}

function resetFsMocks() {
  readFile.mockImplementation(async (filePath) => {
    if (!fileMap.has(filePath)) throw makeMissingError(filePath);
    const value = fileMap.get(filePath);
    if (value instanceof Error) throw value;
    return value;
  });
  writeFile.mockImplementation(async (filePath, text) => {
    fileMap.set(filePath, String(text));
  });
  mkdir.mockImplementation(async () => {});
  unlink.mockImplementation(async (filePath) => {
    if (!fileMap.has(filePath)) throw makeMissingError(filePath);
    fileMap.delete(filePath);
  });
  existsSync.mockImplementation((filePath) => fileMap.has(filePath));
}

function installSystemctlMock({
  versionOk = true,
  running = false,
  enabled = false,
} = {}) {
  const state = {
    running,
    enabled,
    pid: running ? 2222 : 0,
    startedAt: new Date('2026-07-09T00:00:00.000Z'),
  };

  spawnSync.mockImplementation((command, args) => {
    if (command !== 'systemctl') {
      return { error: new Error(`unexpected command: ${command}`), status: 1, stdout: '', stderr: '' };
    }

    const [first] = args;
    if (first === '--version') {
      return versionOk
        ? { error: null, status: 0, stdout: 'systemd 255', stderr: '' }
        : { error: new Error('systemctl missing'), status: 1, stdout: '', stderr: 'systemctl missing' };
    }

    if (first === 'daemon-reload') {
      return { error: null, status: 0, stdout: '', stderr: '' };
    }

    if (first === 'start') {
      state.running = true;
      state.pid = 3333;
      state.startedAt = new Date('2026-07-09T01:00:00.000Z');
      return { error: null, status: 0, stdout: '', stderr: '' };
    }

    if (first === 'stop') {
      state.running = false;
      state.pid = 0;
      return { error: null, status: 0, stdout: '', stderr: '' };
    }

    if (first === 'restart') {
      state.running = true;
      state.pid = 4444;
      state.startedAt = new Date('2026-07-09T02:00:00.000Z');
      return { error: null, status: 0, stdout: '', stderr: '' };
    }

    if (first === 'enable') {
      state.enabled = true;
      return { error: null, status: 0, stdout: '', stderr: '' };
    }

    if (first === 'disable') {
      state.enabled = false;
      return { error: null, status: 0, stdout: '', stderr: '' };
    }

    if (first === 'show') {
      return {
        error: null,
        status: 0,
        stdout: [
          'LoadState=loaded',
          `ActiveState=${state.running ? 'active' : 'inactive'}`,
          `SubState=${state.running ? 'running' : 'dead'}`,
          `UnitFileState=${state.enabled ? 'enabled' : 'disabled'}`,
          `MainPID=${state.running ? state.pid : 0}`,
          'CPUUsageNSec=5000000000',
          'MemoryCurrent=10485760',
          `ActiveEnterTimestamp=${state.running ? state.startedAt.toISOString() : ''}`,
        ].join('\n'),
        stderr: '',
      };
    }

    if (first === 'status') {
      return {
        error: null,
        status: 0,
        stdout: [
          'Loaded: loaded',
          `Active: ${state.running ? 'active (running)' : 'inactive (dead)'}`,
          'Warning: ignore this line',
          'agentx-gui listening on http://0.0.0.0:3100',
        ].join('\n'),
        stderr: '',
      };
    }

    return { error: null, status: 0, stdout: '', stderr: '' };
  });

  return state;
}

await jest.unstable_mockModule('node:child_process', () => ({ spawnSync }));
await jest.unstable_mockModule('node:fs', () => ({ existsSync }));
await jest.unstable_mockModule('node:fs/promises', () => ({ mkdir, readFile, writeFile, unlink }));
await jest.unstable_mockModule('node:readline/promises', () => ({ createInterface }));

const setup = await import('../src/setup.mjs');
const {
  buildServiceUnit,
  detectSystemdAvailability,
  disableService,
  enableService,
  ensureServiceInstalled,
  formatServiceStatusSummary,
  getServiceName,
  getServiceUnitPath,
  getSetupRootDir,
  isServiceInstalled,
  readEnvState,
  readServiceStatus,
  repairService,
  restartService,
  setupInternals,
  setupPaths,
  startService,
  stopService,
  uninstallService,
  validateHost,
  validatePort,
  writeEnvState,
  writeServiceUnit,
} = setup;

beforeEach(() => {
  fileMap.clear();
  spawnSync.mockReset();
  existsSync.mockReset();
  readFile.mockReset();
  writeFile.mockReset();
  mkdir.mockReset();
  unlink.mockReset();
  createInterface.mockReset();
  resetFsMocks();
});

describe('setup helpers', () => {
  test('validates HOST and PORT values', () => {
    expect(validateHost(undefined)).toMatchObject({ ok: false });
    expect(validateHost('')).toMatchObject({ ok: false });
    expect(validateHost('0.0.0.0')).toEqual({ ok: true, value: '0.0.0.0' });
    expect(validateHost('127.0.0.1')).toEqual({ ok: true, value: '127.0.0.1' });
    expect(validateHost('::')).toEqual({ ok: true, value: '::' });
    expect(validateHost('10.1.2.3')).toEqual({ ok: true, value: '10.1.2.3' });
    expect(validateHost('not-an-ip')).toMatchObject({ ok: false });

    expect(validatePort(undefined)).toMatchObject({ ok: false });
    expect(validatePort('')).toMatchObject({ ok: false });
    expect(validatePort('3100')).toEqual({ ok: true, value: '3100' });
    expect(validatePort('0')).toMatchObject({ ok: false });
    expect(validatePort('70000')).toMatchObject({ ok: false });
    expect(validatePort('abc')).toMatchObject({ ok: false });
  });

  test('formats values and parses env/systemctl text', () => {
    expect(setupInternals.formatMaybeBlank(undefined)).toBe('(blank)');
    expect(setupInternals.formatMaybeBlank('  value  ')).toBe('value');

    expect(setupInternals.formatBytes(-1)).toBe('-');
    expect(setupInternals.formatBytes(512)).toBe('512 B');
    expect(setupInternals.formatBytes(1536)).toBe('1.5 KiB');
    expect(setupInternals.formatBytes(5 * 1024 * 1024)).toBe('5.0 MiB');

    expect(setupInternals.formatDuration(undefined)).toBe('0s');
    expect(setupInternals.formatDuration(0)).toBe('0s');
    expect(setupInternals.formatDuration(62000)).toBe('1m 02s');
    expect(setupInternals.formatDuration(3723000)).toBe('1h 02m 03s');

    expect(setupInternals.formatCpuTime(undefined)).toBe('00:00');
    expect(setupInternals.formatCpuTime('')).toBe('00:00');
    expect(setupInternals.formatCpuTime('   ')).toBe('00:00');
    expect(setupInternals.formatCpuTime(0)).toBe('00:00');
    expect(setupInternals.formatCpuTime('not-a-number')).toBe('-');
    expect(setupInternals.formatCpuTime(5_000_000_000n)).toBe('00:05');
    expect(setupInternals.formatCpuTime(3_600_000_000_000n)).toBe('01:00:00');

    expect(setupInternals.serializeEnvValue(undefined)).toBe('');
    expect(setupInternals.serializeEnvValue('')).toBe('');
    expect(setupInternals.serializeEnvValue('abc-_.:/123')).toBe('abc-_.:/123');
    expect(setupInternals.serializeEnvValue('quote"and\\slash')).toBe('"quote\\"and\\\\slash"');

    expect(setupInternals.parseEnvLines(undefined)).toEqual([{ type: 'raw', line: '' }]);
    expect(setupInternals.parseEnvLines('# comment\nFOO=bar\nSPACED = value\ninvalid-line')).toEqual([
      { type: 'raw', line: '# comment' },
      { type: 'pair', key: 'FOO', value: 'bar', line: 'FOO=bar' },
      { type: 'pair', key: 'SPACED', value: 'value', line: 'SPACED = value' },
      { type: 'raw', line: 'invalid-line' },
    ]);

    expect(setupInternals.updateEnvText('', {})).toBe('');
    expect(setupInternals.updateEnvText('A=1\nA=2\n# keep\n\n', { A: '3', B: 'two words' })).toBe('A=3\n# keep\n\n\nB="two words"\n');

    expect(setupInternals.parseSystemctlProperties(undefined)).toEqual({});
    expect(setupInternals.parseSystemctlProperties('A=1\nB = two\nmalformed')).toEqual({ A: '1', B: 'two' });
    expect(setupInternals.extractLastUsefulLogLine(undefined)).toBe('');
    expect(setupInternals.extractLastUsefulLogLine('Loaded: x\nHint: ignore\nJul 09 12:34:56 host agentx-gui[1]: started')).toBe('Jul 09 12:34:56 host agentx-gui[1]: started');
    expect(setupInternals.extractLastUsefulLogLine('Warning: ignore\nagentx-gui listening on http://0.0.0.0:3100')).toBe('agentx-gui listening on http://0.0.0.0:3100');
    expect(setupInternals.extractLastUsefulLogLine('Loaded: x\nWarning: ignore\n')).toBe('');
    expect(setupInternals.extractLastUsefulLogLine('plain log line')).toBe('');
    expect(setupInternals.extractLastUsefulLogLine('agentx-gui.service failed')).toBe('agentx-gui.service failed');
  });

  test('builds and writes service units and exposes paths', async () => {
    const root = '/tmp/agentx-custom-root';
    const templatePath = path.join(root, 'agentx-gui.service');
    const template = 'WorkingDirectory=/opt/agentx-cli\nExecStart=/opt/agentx-cli/agentx-gui.mjs\nEnvironmentFile=/opt/agentx-cli/.env\n';
    fileMap.set(templatePath, template);
    fileMap.set(setupPaths.serviceTemplatePath, template);
    expect(getServiceName()).toBe('agentx-gui.service');
    expect(getServiceUnitPath()).toBe('/usr/lib/systemd/system/agentx-gui.service');
    expect(getSetupRootDir()).toBe(process.cwd());
    expect(setupPaths.rootDir).toBe(process.cwd());
    expect(setupPaths.envPath).toBe(path.join(process.cwd(), '.env'));
    expect(setupPaths.serviceTemplatePath).toBe(path.join(process.cwd(), 'agentx-gui.service'));

    const unit = await buildServiceUnit(root);
    expect(unit).toContain(`WorkingDirectory=${root}`);
    expect(await setupInternals.readServiceText(root)).toBe(fileMap.get(templatePath));
    expect(await setupInternals.readServiceText()).toBe(fileMap.get(templatePath));
    expect(unit).toContain(`ExecStart=${root}/agentx-gui.mjs`);
    expect(unit).toContain(`EnvironmentFile=${root}/.env`);

    const targetPath = '/tmp/agentx-custom-root/agentx-gui.service.generated';
    const written = await writeServiceUnit(root, targetPath);
    expect(written).toBe(unit);
    expect(fileMap.get(targetPath)).toBe(unit);
    expect(mkdir).toHaveBeenCalledWith(path.dirname(targetPath), { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(targetPath, unit, 'utf8');
  });

  test('falls back to the generic systemctl failure message when stdout and stderr are empty', async () => {
    spawnSync.mockImplementation((command, args) => {
      if (command !== 'systemctl') {
        return { error: new Error(`unexpected command: ${command}`), status: 1, stdout: '', stderr: '' };
      }
      if (args[0] === 'start') {
        return { error: null, status: 1, stdout: '   ', stderr: '' };
      }
      return { error: null, status: 0, stdout: '', stderr: '' };
    });

    await expect(startService()).rejects.toThrow('systemctl start agentx-gui.service failed');
  });

  test('uses default service paths when helpers are called without arguments', async () => {
    const template = 'WorkingDirectory=/opt/agentx-cli\nExecStart=/opt/agentx-cli/agentx-gui.mjs\nEnvironmentFile=/opt/agentx-cli/.env\n';
    fileMap.set(setupPaths.serviceTemplatePath, template);
    spawnSync.mockImplementation((command, args) => {
      if (command !== 'systemctl') throw new Error('unexpected command');
      if (args[0] === '--version') return { error: null, status: 0, stdout: 'systemd 255', stderr: '' };
      if (args[0] === 'show') return { error: null, status: 0, stdout: 'LoadState=loaded\nActiveState=inactive\nSubState=dead\nUnitFileState=disabled\nMainPID=0\nCPUUsageNSec=\nMemoryCurrent=\nActiveEnterTimestamp=\n', stderr: '' };
      if (args[0] === 'status') return { error: null, status: 0, stdout: 'Loaded: loaded\nagentx-gui.service ready\n', stderr: '' };
      return { error: null, status: 0, stdout: '', stderr: '' };
    });
    existsSync.mockImplementation((filePath) => fileMap.has(filePath));

    const unit = await buildServiceUnit();
    expect(unit).toContain('WorkingDirectory=/opt/agentx-cli');
    expect(await writeServiceUnit()).toBe(unit);
    expect(isServiceInstalled()).toBe(true);
    await ensureServiceInstalled();
    await repairService();
    expect((await readServiceStatus()).installed).toBe(true);
    await uninstallService();
    expect(isServiceInstalled()).toBe(false);
  });

  test('reads and writes env files while preserving defaults', async () => {
    const envPath = '/tmp/agentx-env/.env';
    fileMap.set(envPath, 'AGENTX_API_KEY=abc\nHOST=127.0.0.1\nPORT=3200\nOTHER=keep\n');

    const state = await readEnvState(envPath);
    expect(state).toEqual({
      filePath: envPath,
      text: 'AGENTX_API_KEY=abc\nHOST=127.0.0.1\nPORT=3200\nOTHER=keep\n',
      values: { AGENTX_API_KEY: 'abc', HOST: '127.0.0.1', PORT: '3200' },
    });

    const defaultState = await readEnvState();
    expect(defaultState.filePath).toBe(setupPaths.envPath);
    expect(defaultState.values).toEqual({ AGENTX_API_KEY: '', HOST: '0.0.0.0', PORT: '3100' });

    const missing = await readEnvState('/tmp/agentx-env/missing.env');
    expect(missing.values).toEqual({ AGENTX_API_KEY: '', HOST: '0.0.0.0', PORT: '3100' });

    const nextText = await writeEnvState(envPath, { AGENTX_API_KEY: 'new key', HOST: '0.0.0.0', PORT: '3101' }, state.text);
    expect(nextText).toBe('AGENTX_API_KEY="new key"\nHOST=0.0.0.0\nPORT=3101\nOTHER=keep\n');
    expect(fileMap.get(envPath)).toBe(nextText);

    const followUp = await writeEnvState('/tmp/agentx-env/fresh.env', { HOST: '::1' }, null);
    expect(followUp).toBe('\nHOST=::1\n');
    expect(fileMap.get('/tmp/agentx-env/fresh.env')).toBe('\nHOST=::1\n');
  });

  test('detects systemd availability across branches', () => {
    existsSync.mockReturnValue(true);
    spawnSync.mockReturnValue({ error: null, status: 0, stdout: 'systemd 255', stderr: '' });
    expect(detectSystemdAvailability({ platform: 'linux' })).toBe(true);

    existsSync.mockReturnValue(false);
    expect(detectSystemdAvailability({ platform: 'linux' })).toBe(false);
    expect(detectSystemdAvailability({ platform: 'win32' })).toBe(false);

    existsSync.mockReturnValue(true);
    spawnSync.mockReturnValue({ error: new Error('missing systemctl'), status: 1, stdout: '', stderr: '' });
    expect(detectSystemdAvailability({ platform: 'linux' })).toBe(false);
  });

  test('formats service status summaries', () => {
    expect(formatServiceStatusSummary({ installed: true, enabled: true, running: true, pid: 123, uptime: '1m 02s', cpu: '00:01', memory: '12.0 MiB', lastLog: 'agentx-gui listening on http://0.0.0.0:3100' }))
      .toContain('Service: active / running / enabled / success');
    expect(formatServiceStatusSummary({ installed: false, enabled: false, running: false, pid: null, uptime: '', cpu: '', memory: '', lastLog: '' }))
      .toContain('Service: inactive / dead / disabled / error');
  });

  test('builds menu entries for all service states', () => {
    expect(setupInternals.buildMenuEntries({ values: { AGENTX_API_KEY: '', HOST: '', PORT: '' }, systemdAvailable: false, serviceStatus: { installed: false, running: false, enabled: false } }))
      .toEqual([
        { id: 'api', label: 'Edit API key (blank)' },
        { id: 'host', label: 'Edit HOST (0.0.0.0)' },
        { id: 'port', label: 'Edit PORT (3100)' },
        { id: 'quit', label: 'Quit' },
      ]);

    expect(setupInternals.buildMenuEntries({ values: { AGENTX_API_KEY: 'set', HOST: '10.0.0.1', PORT: '3200' }, systemdAvailable: true, serviceStatus: { installed: false, running: false, enabled: false } }).map((entry) => entry.id))
      .toEqual(['api', 'host', 'port', 'install', 'status', 'quit']);

    expect(setupInternals.buildMenuEntries({ values: { AGENTX_API_KEY: 'set', HOST: '10.0.0.1', PORT: '3200' }, systemdAvailable: true, serviceStatus: { installed: true, running: false, enabled: false } }).map((entry) => entry.id))
      .toEqual(['api', 'host', 'port', 'repair', 'uninstall', 'start', 'enable', 'status', 'quit']);

    expect(setupInternals.buildMenuEntries({ values: { AGENTX_API_KEY: 'set', HOST: '10.0.0.1', PORT: '3200' }, systemdAvailable: true, serviceStatus: { installed: true, running: true, enabled: true } }).map((entry) => entry.id))
      .toEqual(['api', 'host', 'port', 'repair', 'uninstall', 'stop', 'restart', 'disable', 'status', 'quit']);
  });
});

describe('service helpers', () => {
  test('reads service status for installed and missing services', async () => {
    const missing = await readServiceStatus('/tmp/agentx-missing.service');
    expect(missing).toEqual(expect.objectContaining({ installed: false, enabled: false, running: false, pid: null, uptime: '', cpu: '', memory: '', lastLog: '' }));

    const unitPath = '/tmp/agentx-present.service';
    fileMap.set(unitPath, 'installed');
    installSystemctlMock({ running: true, enabled: true, pid: 2222 });
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-09T01:00:00.000Z'));
    const status = await readServiceStatus(unitPath);
    expect(status).toMatchObject({ installed: true, enabled: true, running: true, pid: 2222, uptime: '1h 00m 00s', cpu: '00:05', memory: '10.0 MiB', lastLog: 'agentx-gui listening on http://0.0.0.0:3100' });
    expect(status.activeState).toBe('active');
    expect(status.subState).toBe('running');
    expect(status.unitFileState).toBe('enabled');
    nowSpy.mockRestore();
  });

  test('reads fallback service status fields when systemctl omits properties', async () => {
    const unitPath = '/tmp/agentx-blank.service';
    fileMap.set(unitPath, 'installed');
    spawnSync.mockImplementation((command, args) => {
      if (command !== 'systemctl') throw new Error('unexpected command');
      if (args[0] === 'show') {
        return { error: null, status: 0, stdout: '', stderr: '' };
      }
      if (args[0] === 'status') {
        return { error: null, status: 0, stdout: '', stderr: 'agentx-gui.service failed\n' };
      }
      return { error: null, status: 0, stdout: '', stderr: '' };
    });
    const status = await readServiceStatus(unitPath);
    expect(status).toMatchObject({ installed: true, enabled: false, running: false, pid: null, uptime: '', cpu: '', memory: '', lastLog: 'agentx-gui.service failed' });
    expect(status.activeState).toBe('inactive');
    expect(status.subState).toBe('dead');
    expect(status.unitFileState).toBe('disabled');
  });

  test('installs, repairs, starts, stops, restarts, enables, and disables services', async () => {
    const unitPath = '/tmp/agentx-install.service';
    const root = '/tmp/agentx-install-root';
    fileMap.set(path.join(root, 'agentx-gui.service'), 'WorkingDirectory=/opt/agentx-cli\nExecStart=/opt/agentx-cli/agentx-gui.mjs\n');
    installSystemctlMock();

    await ensureServiceInstalled(root, unitPath);
    expect(fileMap.get(unitPath)).toContain(`WorkingDirectory=${root}`);
    expect(spawnSync).toHaveBeenCalledWith('systemctl', ['daemon-reload'], { encoding: 'utf8' });

    await repairService(root, unitPath);
    await startService();
    await restartService();
    await enableService();
    await disableService();
    await stopService();

    expect(spawnSync.mock.calls.some((call) => call[1][0] === 'start')).toBe(true);
    expect(spawnSync.mock.calls.some((call) => call[1][0] === 'restart')).toBe(true);
    expect(spawnSync.mock.calls.some((call) => call[1][0] === 'enable')).toBe(true);
    expect(spawnSync.mock.calls.some((call) => call[1][0] === 'disable')).toBe(true);
    expect(spawnSync.mock.calls.some((call) => call[1][0] === 'stop')).toBe(true);
  });

  test('uses default service paths when helpers are called without arguments', async () => {
    const template = 'WorkingDirectory=/opt/agentx-cli\nExecStart=/opt/agentx-cli/agentx-gui.mjs\nEnvironmentFile=/opt/agentx-cli/.env\n';
    fileMap.set(setupPaths.serviceTemplatePath, template);
    installSystemctlMock();

    const unit = await buildServiceUnit();
    expect(unit).toContain('WorkingDirectory=/opt/agentx-cli');
    expect(await writeServiceUnit()).toBe(unit);
    expect(isServiceInstalled()).toBe(true);
    await ensureServiceInstalled();
    await repairService();
    expect((await readServiceStatus()).installed).toBe(true);
    await uninstallService();
    expect(isServiceInstalled()).toBe(false);
  });

  test('uninstalls services and ignores stop/disable/unlink failures', async () => {
    const unitPath = '/tmp/agentx-uninstall.service';
    fileMap.set(unitPath, 'installed');
    spawnSync.mockImplementation((command, args) => {
      if (command !== 'systemctl') throw new Error('unexpected command');
      if (args[0] === 'stop' || args[0] === 'disable') {
        return { error: new Error(`failed ${args[0]}`), status: 1, stdout: '', stderr: '' };
      }
      if (args[0] === 'daemon-reload') {
        return { error: null, status: 0, stdout: '', stderr: '' };
      }
      return { error: null, status: 0, stdout: '', stderr: '' };
    });
    unlink.mockImplementation(async () => {
      const error = new Error('gone');
      error.code = 'ENOENT';
      throw error;
    });

    await expect(uninstallService(unitPath)).resolves.toBeUndefined();
    expect(spawnSync.mock.calls.filter((call) => call[1][0] === 'stop')).toHaveLength(1);
    expect(spawnSync.mock.calls.filter((call) => call[1][0] === 'disable')).toHaveLength(1);
    expect(spawnSync.mock.calls.filter((call) => call[1][0] === 'daemon-reload')).toHaveLength(1);
  });

  test('propagates unlink failures other than ENOENT during uninstall', async () => {
    const unitPath = '/tmp/agentx-bad-uninstall.service';
    fileMap.set(unitPath, 'installed');
    installSystemctlMock();
    unlink.mockImplementation(async () => {
      const error = new Error('permission denied');
      error.code = 'EACCES';
      throw error;
    });
    await expect(uninstallService(unitPath)).rejects.toThrow('permission denied');
  });

  test('propagates service command failures when failure is not allowed', async () => {
    spawnSync.mockReturnValue({ error: null, status: 1, stdout: '', stderr: 'boom' });
    await expect(startService()).rejects.toThrow('boom');

    spawnSync.mockReturnValue({ error: null, status: 1, stdout: 'stdout message', stderr: '' });
    await expect(startService()).rejects.toThrow('stdout message');

    spawnSync.mockReturnValue({ error: null, status: 1, stdout: '', stderr: '' });
    await expect(startService()).rejects.toThrow('systemctl start agentx-gui.service failed');
  });

  test('propagates read/write failures for env helpers', async () => {
    const brokenRead = new Error('permission denied');
    brokenRead.code = 'EACCES';
    readFile.mockImplementation(async () => { throw brokenRead; });
    await expect(readEnvState('/tmp/broken.env')).rejects.toThrow('permission denied');
    await expect(writeEnvState('/tmp/broken.env', { HOST: '127.0.0.1' })).rejects.toThrow('permission denied');
  });
});
