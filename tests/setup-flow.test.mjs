import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
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

function setTTY(stdinTTY, stdoutTTY) {
  const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: stdinTTY });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: stdoutTTY });
  return () => {
    if (stdinDescriptor) Object.defineProperty(process.stdin, 'isTTY', stdinDescriptor);
    else delete process.stdin.isTTY;
    if (stdoutDescriptor) Object.defineProperty(process.stdout, 'isTTY', stdoutDescriptor);
    else delete process.stdout.isTTY;
  };
}

await jest.unstable_mockModule('node:child_process', () => ({ spawnSync }));
await jest.unstable_mockModule('node:fs', () => ({ existsSync }));
await jest.unstable_mockModule('node:fs/promises', () => ({ mkdir, readFile, writeFile, unlink }));
await jest.unstable_mockModule('node:readline/promises', () => ({ createInterface }));

const { runSetup } = await import('../src/setup.mjs');

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
  fileMap.set(path.join(process.cwd(), 'agentx-gui.service'), 'WorkingDirectory=/opt/agentx-cli\nExecStart=/opt/agentx-cli/agentx-gui.mjs\nEnvironmentFile=/opt/agentx-cli/.env\n');
  fileMap.set(path.join(process.cwd(), '.env'), 'AGENTX_API_KEY=\nHOST=\nPORT=\n');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('runSetup', () => {
  test('prints the non-interactive warning and exits early', async () => {
    installSystemctlMock({ versionOk: false });
    const restoreTTY = setTTY(false, false);
    const writes = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };

    try {
      await runSetup();
      expect(createInterface).not.toHaveBeenCalled();
      expect(writes.join('')).toContain('AgentX setup requires an interactive terminal.');
    } finally {
      process.stdout.write = originalWrite;
      restoreTTY();
    }
  });


  test('renders the no-systemd screen when systemd is unavailable', async () => {
    const restoreTTY = setTTY(true, true);
    const writes = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    fileMap.delete('/run/systemd/system');
    installSystemctlMock({ versionOk: false });
    createInterface.mockReturnValue({
      question: async () => 'quit',
      close: jest.fn(),
    });

    try {
      await runSetup();
      expect(writes.join('')).toContain('Systemd: unavailable');
      expect(writes.join('')).toContain('Run npm run start:gui to launch the web UI manually.');
    } finally {
      process.stdout.write = originalWrite;
      restoreTTY();
    }
  });

  test('drops cached env reads after writes when the file becomes temporarily unavailable', async () => {
    fileMap.set('/run/systemd/system', 'present');
    installSystemctlMock({ running: false, enabled: false });
    const restoreTTY = setTTY(true, true);
    const writes = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    let failReads = 3;
    readFile.mockImplementation(async (filePath) => {
      if (filePath === path.join(process.cwd(), '.env') && failReads > 0) {
        failReads -= 1;
        const error = makeMissingError(filePath);
        throw error;
      }
      if (!fileMap.has(filePath)) throw makeMissingError(filePath);
      const value = fileMap.get(filePath);
      if (value instanceof Error) throw value;
      return value;
    });
    const questions = ['api', 'new-api-key', 'host', '10.1.2.3', 'port', '3201', 'quit'];
    createInterface.mockReturnValue({
      question: async () => questions.shift() ?? 'quit',
      close: jest.fn(),
    });

    try {
      await runSetup();
      expect(writes.join('')).toContain('API key saved.');
      expect(writes.join('')).toContain('HOST saved.');
      expect(writes.join('')).toContain('PORT saved.');
    } finally {
      process.stdout.write = originalWrite;
      restoreTTY();
    }
  });

  test('uses default HOST and PORT values when the env file is blank', async () => {
    const restoreTTY = setTTY(true, true);
    const writes = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    installSystemctlMock({ versionOk: false });
    const questions = ['host', '', 'port', '', 'quit'];
    createInterface.mockReturnValue({
      question: async () => questions.shift() ?? 'quit',
      close: jest.fn(),
    });

    try {
      await runSetup();
      expect(writes.join('')).toContain('HOST: 0.0.0.0');
      expect(writes.join('')).toContain('PORT: 3100');
    } finally {
      process.stdout.write = originalWrite;
      restoreTTY();
    }
  });

  test('uses saved HOST and PORT values when the user presses Enter', async () => {
    fileMap.set(path.join(process.cwd(), '.env'), 'AGENTX_API_KEY=\nHOST=10.9.8.7\nPORT=4555\n');
    const restoreTTY = setTTY(true, true);
    const writes = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    installSystemctlMock({ versionOk: false });
    const questions = ['host', '', 'port', '', 'quit'];
    createInterface.mockReturnValue({
      question: async () => questions.shift() ?? 'quit',
      close: jest.fn(),
    });

    try {
      await runSetup();
      expect(writes.join('')).toContain('HOST: 10.9.8.7');
      expect(writes.join('')).toContain('PORT: 4555');
    } finally {
      process.stdout.write = originalWrite;
      restoreTTY();
    }
  });

  test('drops the post-write PORT cache when the env file disappears', async () => {
    installSystemctlMock({ versionOk: false });
    const restoreTTY = setTTY(true, true);
    const writes = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };
    let failReads = 2;
    readFile.mockImplementation(async (filePath) => {
      if (filePath === path.join(process.cwd(), '.env') && failReads > 0) {
        failReads -= 1;
        throw makeMissingError(filePath);
      }
      if (!fileMap.has(filePath)) throw makeMissingError(filePath);
      const value = fileMap.get(filePath);
      if (value instanceof Error) throw value;
      return value;
    });
    const questions = ['port', '3201', 'quit'];
    createInterface.mockReturnValue({
      question: async () => questions.shift() ?? 'quit',
      close: jest.fn(),
    });

    try {
      await runSetup();
      expect(writes.join('')).toContain('PORT saved.');
    } finally {
      process.stdout.write = originalWrite;
      restoreTTY();
    }
  });

  test('reaches the status menu guard with a non-status selection before quitting', async () => {
    fileMap.set('/run/systemd/system', 'present');
    installSystemctlMock({ running: false, enabled: false });
    const restoreTTY = setTTY(true, true);
    const writes = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };

    const originalFind = Array.prototype.find;
    let hijackOnce = true;
    const findSpy = jest.spyOn(Array.prototype, 'find').mockImplementation(function(predicate, thisArg) {
      if (hijackOnce) {
        hijackOnce = false;
        return { id: 'bogus', label: 'Bogus choice' };
      }
      return originalFind.call(this, predicate, thisArg);
    });

    const questions = ['bogus', 'quit'];
    createInterface.mockReturnValue({
      question: async () => questions.shift() ?? 'quit',
      close: jest.fn(),
    });

    try {
      await runSetup();
      expect(findSpy).toHaveBeenCalled();
      expect(writes.join('')).not.toContain('Unknown option.');
    } finally {
      findSpy.mockRestore();
      process.stdout.write = originalWrite;
      restoreTTY();
    }
  });

  test('walks the interactive setup flow and exercises menu branches', async () => {
    fileMap.set('/run/systemd/system', 'present');
    const state = installSystemctlMock({ running: false, enabled: false });
    const restoreTTY = setTTY(true, true);
    const writes = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      writes.push(String(chunk));
      return true;
    };

    const questions = [
      'bogus',
      '1',
      '',
      'new-api-key',
      'host',
      'not-an-ip',
      '10.1.2.3',
      'port',
      '70000',
      '3201',
      'install',
      'repair service',
      'start',
      'restart service',
      'enable',
      'disable at boot',
      'stop',
      'status',
      '',
      'uninstall',
      'quit',
    ];
    createInterface.mockReturnValue({
      question: async () => questions.shift() ?? 'quit',
      close: jest.fn(),
    });

    try {
      await runSetup();

      expect(writes.join('')).toContain('Unknown option.');
      expect(writes.join('')).toContain('API key is required.');
      expect(writes.join('')).toContain('HOST must be an IP address');
      expect(writes.join('')).toContain('PORT must be a number between 1 and 65535.');
      expect(writes.join('')).toContain('API key saved.');
      expect(writes.join('')).toContain('HOST saved.');
      expect(writes.join('')).toContain('PORT saved.');
      expect(writes.join('')).toContain('Service installed and daemon reloaded.');
      expect(writes.join('')).toContain('Service repaired and daemon reloaded.');
      expect(writes.join('')).toContain('Service started.');
      expect(writes.join('')).toContain('Service restarted.');
      expect(writes.join('')).toContain('Service enabled.');
      expect(writes.join('')).toContain('Service disabled.');
      expect(writes.join('')).toContain('Service stopped.');
      expect(writes.join('')).toContain('Service uninstalled.');
      expect(writes.join('')).toContain('Service: inactive / dead / disabled / error');
      expect(createInterface).toHaveBeenCalled();
      expect(fileMap.get(path.join(process.cwd(), '.env'))).toContain('AGENTX_API_KEY=new-api-key');
      expect(fileMap.get(path.join(process.cwd(), '.env'))).toContain('HOST=10.1.2.3');
      expect(fileMap.get(path.join(process.cwd(), '.env'))).toContain('PORT=3201');
      expect(fileMap.has('/usr/lib/systemd/system/agentx-gui.service')).toBe(false);
      expect(state.running).toBe(false);
      expect(state.enabled).toBe(false);
    } finally {
      process.stdout.write = originalWrite;
      restoreTTY();
    }
  });
});
