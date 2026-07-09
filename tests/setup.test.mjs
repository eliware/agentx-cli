import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const spawnSync = jest.fn();
const existsSync = jest.fn();

await jest.unstable_mockModule('node:child_process', () => ({
  spawnSync,
}));
await jest.unstable_mockModule('node:fs', () => ({
  existsSync,
}));

const setup = await import('../src/setup.mjs');
const {
  buildServiceUnit,
  detectSystemdAvailability,
  formatServiceStatusSummary,
  readEnvState,
  setupInternals,
  setupPaths,
  validateHost,
  validatePort,
} = setup;

describe('setup helpers', () => {
  beforeEach(() => {
    spawnSync.mockReset();
    existsSync.mockReset();
  });

  test('validates HOST and PORT values', () => {
    expect(validateHost('0.0.0.0')).toEqual({ ok: true, value: '0.0.0.0' });
    expect(validateHost('127.0.0.1')).toEqual({ ok: true, value: '127.0.0.1' });
    expect(validateHost('::')).toEqual({ ok: true, value: '::' });
    expect(validateHost('::1')).toEqual({ ok: true, value: '::1' });
    expect(validateHost('not-an-ip').ok).toBe(false);

    expect(validatePort('3100')).toEqual({ ok: true, value: '3100' });
    expect(validatePort('0').ok).toBe(false);
    expect(validatePort('70000').ok).toBe(false);
    expect(validatePort('abc').ok).toBe(false);
  });

  test('parses and updates env text without dropping unrelated lines', () => {
    const text = '# comment\nFOO=bar\nHOST=127.0.0.1\nPORT=3200\n';
    const updated = setupInternals.updateEnvText(text, { HOST: '0.0.0.0', PORT: '3100', AGENTX_API_KEY: 'secret-key' });
    expect(updated).toContain('# comment');
    expect(updated).toContain('FOO=bar');
    expect(updated).toContain('HOST=0.0.0.0');
    expect(updated).toContain('PORT=3100');
    expect(updated).toContain('AGENTX_API_KEY=secret-key');
  });

  test('buildServiceUnit rewrites the install root', async () => {
    const { mkdtemp, mkdir, readFile, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join, dirname } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'agentx-setup-unit-'));
    try {
      await mkdir(dirname(join(dir, 'agentx-gui.service')), { recursive: true });
      await writeFile(join(dir, 'agentx-gui.service'), await readFile('agentx-gui.service', 'utf8'));
      const unit = await buildServiceUnit(dir);
      expect(unit).toContain(`WorkingDirectory=${dir}`);
      expect(unit).toContain(`ExecStart=${dir}/agentx-gui.mjs`);
      expect(unit).toContain(`EnvironmentFile=${dir}/.env`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('detectSystemdAvailability requires linux, systemd, and systemctl', () => {
    existsSync.mockReturnValue(true);
    spawnSync.mockReturnValue({ error: null, status: 0 });
    expect(detectSystemdAvailability({ platform: 'linux' })).toBe(true);

    existsSync.mockReturnValue(false);
    expect(detectSystemdAvailability({ platform: 'linux' })).toBe(false);
    expect(detectSystemdAvailability({ platform: 'win32' })).toBe(false);
  });

  test('formats status summaries', () => {
    expect(formatServiceStatusSummary({ installed: true, enabled: true, running: true, pid: 123, uptime: '1m 02s', cpu: '00:01', memory: '12.0 MiB', lastLog: 'agentx-gui listening on http://0.0.0.0:3100' }))
      .toContain('Service: active / running / enabled / success');
    expect(formatServiceStatusSummary({ installed: false, enabled: false, running: false, pid: null, uptime: '', cpu: '', memory: '', lastLog: '' }))
      .toContain('Service: inactive / dead / disabled / error');
  });

  test('reads env state and preserves defaults', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join, dirname } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'agentx-setup-'));
    try {
      const envFile = join(dir, '.env');
      await mkdir(dirname(envFile), { recursive: true });
      await writeFile(envFile, 'AGENTX_API_KEY=abc\nHOST=127.0.0.1\nPORT=3200\n');
      const state = await readEnvState(envFile);
      expect(state.values).toEqual({ AGENTX_API_KEY: 'abc', HOST: '127.0.0.1', PORT: '3200' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
