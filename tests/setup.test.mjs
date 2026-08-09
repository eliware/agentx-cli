import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildMenuEntries, readEnvState, runSetup, setupInternals, setupPaths, writeEnvState } from '../src/setup.mjs';

class FakeTerminal extends EventEmitter {
  constructor() { super(); this.isTTY = true; this.raw = false; this.resumed = false; }
  setRawMode(value) { this.raw = value; }
  resume() { this.resumed = true; }
  pause() { this.paused = true; }
}
class FakeOutput extends EventEmitter { constructor() { super(); this.isTTY = true; this.text = ''; } write(value) { this.text += value; } }

const send = (stdin, value) => setImmediate(() => stdin.emit('data', Buffer.from(value)));

describe('setup helpers', () => {
  test('covers masked input cancellation and backspace handling', async () => {
    const input = new FakeTerminal(); const output = new FakeOutput();
    const cancelled = setupInternals.askMasked(input, output, 'Key: ', 'fallback');
    send(input, '\u0003');
    await expect(cancelled).resolves.toBe('fallback');

    const editedInput = new FakeTerminal();
    const edited = setupInternals.askMasked(editedInput, output, 'Key: ');
    send(editedInput, 'a\x01\b\b\r');
    await expect(edited).resolves.toBe('');
    expect(output.text).toContain('\b \b');
  });


  test('uses the blank API-key suffix branch', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'agentx-setup-api-'));
    const input = new FakeTerminal(); const output = new FakeOutput();
    try {
      const state = { filePath: path.join(directory, '.agentx'), text: '', values: { AGENTX_API_KEY: '' } };
      const pending = setupInternals.editApiKey(input, state, output);
      send(input, '\r');
      await new Promise((resolve) => setImmediate(resolve));
      send(input, 'valid-key\r');
      await expect(pending).resolves.toBe('API key saved.');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('uses the existing API-key suffix branch', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'agentx-setup-api-set-'));
    const input = new FakeTerminal(); const output = new FakeOutput();
    try {
      const state = { filePath: path.join(directory, '.agentx'), text: '', values: { AGENTX_API_KEY: 'existing-key' } };
      const pending = setupInternals.editApiKey(input, state, output);
      send(input, '\r');
      await expect(pending).resolves.toBe('API key saved.');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('formats and decodes values', () => {
    expect(setupInternals.formatMaybeBlank()).toBe('(blank)');
    expect(setupInternals.formatMaybeBlank(' x ')).toBe('x');
    expect(setupInternals.decodeEnvValue(' "hello" ')).toBe('hello');
    expect(setupInternals.decodeEnvValue('"bad')).toBe('"bad');
    expect(setupInternals.decodeEnvValue(' plain ')).toBe('plain');
    expect(setupInternals.decodeEnvValue(null)).toBe('');
  });

  test('parses and serializes env content', () => {
    expect(setupInternals.parseEnvLines('A=1\n# note\nBAD LINE')).toEqual([
      { type: 'pair', key: 'A', value: '1', line: 'A=1' },
      { type: 'raw', line: '# note' }, { type: 'raw', line: 'BAD LINE' },
    ]);
    expect(setupInternals.parseEnvLines(null)).toEqual([{ type: 'raw', line: '' }]);
    expect(setupInternals.serializeEnvValue('')).toBe('');
    expect(setupInternals.serializeEnvValue(null)).toBe('');
    expect(setupInternals.serializeEnvValue('safe-1:/')).toBe('safe-1:/');
    expect(setupInternals.serializeEnvValue('needs "quotes" \\')).toBe('"needs \\"quotes\\" \\\\"');
    expect(setupInternals.updateEnvText('A=old\nA=duplicate\n# keep\n', { A: 'new', B: 'two words' }))
      .toBe('A=new\n# keep\n\nB="two words"\n');
    expect(setupInternals.updateEnvText('', { A: '1' })).toBe('A=1\n');
  });

  test('renders the default config path when omitted', () => {
    const stdout = new FakeOutput();
    setupInternals.renderScreen({ values: { AGENTX_API_KEY: '' }, stdout });
    expect(stdout.text).toContain(`Config File: ${setupPaths.envPath}`);
    expect(stdout.text).toContain(`MCP Config: ${setupPaths.mcpConfigPath}`);
  });

  test('builds compact menu for API-key-only values', () => {
    expect(buildMenuEntries({ values: { AGENTX_API_KEY: 'key' } })).toEqual([
      { id: 'api', label: 'Edit API key (set)' }, { id: 'quit', label: 'Quit' },
    ]);
  });

  test('builds compact and full menus', () => {
    expect(buildMenuEntries({ values: { AGENTX_API_KEY: '' } }).map((x) => x.id)).toEqual(['api', 'quit']);
    const entries = buildMenuEntries({ values: { AGENTX_API_KEY: 'x' }, includeSettings: true });
    expect(entries.map((x) => x.id)).toEqual(['api', 'model', 'mode', 'effort', 'summary', 'verbosity', 'compaction', 'quit']);
    expect(entries[0].label).toContain('set');
  });
});

describe('setup environment persistence', () => {
  let directory;
  beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'agentx-setup-')); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  test('propagates non-missing read failures', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'agentx-setup-error-'));
    try {
      await expect(readEnvState(directory)).rejects.toBeTruthy();
      await expect(writeEnvState(directory, { AGENTX_API_KEY: 'key' })).rejects.toBeTruthy();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('reads missing and populated files and writes updates', async () => {
    const file = path.join(directory, 'nested', '.agentx');
    expect((await readEnvState(file)).values.AGENTX_API_KEY).toBe('');
    await writeEnvState(file, { AGENTX_API_KEY: 'key', AGENTX_MODEL: 'gpt-5.6-sol' });
    await writeEnvState(file, { AGENTX_MODEL: 'gpt-5.6-terra' });
    const state = await readEnvState(file);
    expect(state.values).toMatchObject({ AGENTX_API_KEY: 'key', AGENTX_MODEL: 'gpt-5.6-terra' });
    expect(await readFile(file, 'utf8')).toContain('AGENTX_MODEL=gpt-5.6-terra');
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  test('tightens permissions on an existing config file', async () => {
    const file = path.join(directory, '.agentx');
    await writeEnvState(file, { AGENTX_API_KEY: 'key' });
    if (process.platform !== 'win32') await chmod(file, 0o644);
    await writeEnvState(file, { AGENTX_MODEL: 'gpt-5.6-sol' });
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);
  });
});

describe('interactive setup', () => {
  test('rejects non-interactive terminals', async () => {
    const stdout = new FakeOutput(); stdout.isTTY = false;
    await runSetup({ stdin: {}, stdout });
    expect(stdout.text).toContain('requires an interactive terminal');
  });

  test('handles arrow navigation and invalid initial indexes', async () => {
    const stdin = new FakeTerminal(); const stdout = new FakeOutput();
    const pending = setupInternals.selectMenu(stdin, stdout, [{ id: 'one', label: 'One' }, { id: 'quit', label: 'Quit' }], 99);
    send(stdin, '\x1b[B');
    send(stdin, '\x1b[A');
    send(stdin, '\r');
    expect(await pending).toEqual({ id: 'one', label: 'One' });
    expect(stdout.text).toContain('Use 1-2, ↑/↓, or Enter.');
  });

  test('trims non-selection input before accepting a selection', async () => {
    const stdin = new FakeTerminal(); const stdout = new FakeOutput();
    const pending = setupInternals.selectMenu(stdin, stdout, [{ id: 'one', label: 'One' }]);
    send(stdin, 'abcdefghi');
    send(stdin, '\r');
    expect(await pending).toEqual({ id: 'one', label: 'One' });
  });

  test('selects an entry with a number', async () => {
    const stdin = new FakeTerminal(); const stdout = new FakeOutput();
    const pending = setupInternals.selectMenu(stdin, stdout, [{ id: 'one', label: 'One' }, { id: 'quit', label: 'Quit' }], 1);
    send(stdin, '2');
    expect(await pending).toEqual({ id: 'quit', label: 'Quit' });
    expect(stdin.raw).toBe(false);
  });

  test('selects the highlighted entry with Enter', async () => {
    const stdin = new FakeTerminal(); const stdout = new FakeOutput();
    const pending = setupInternals.selectMenu(stdin, stdout, [{ id: 'one', label: 'One' }, { id: 'quit', label: 'Quit' }], 1);
    send(stdin, '\r');
    expect(await pending).toEqual({ id: 'quit', label: 'Quit' });
    expect(stdin.raw).toBe(false);
  });

  test('selects quit on Ctrl-C', async () => {
    const stdin = new FakeTerminal(); const stdout = new FakeOutput();
    const pending = setupInternals.selectMenu(stdin, stdout, [{ id: 'one', label: 'One' }, { id: 'quit', label: 'Quit' }]);
    send(stdin, '\u0003');
    expect(await pending).toEqual({ id: 'quit', label: 'Quit' });
  });

  test('evaluates the short-input buffer limit before Ctrl-C', async () => {
    const stdin = new FakeTerminal(); const stdout = new FakeOutput();
    const pending = setupInternals.selectMenu(stdin, stdout, [{ id: 'quit', label: 'Quit' }]);
    send(stdin, 'x');
    send(stdin, 'y');
    send(stdin, '\u0003');
    expect(await pending).toEqual({ id: 'quit', label: 'Quit' });
  });

  test('trims oversized input before accepting a selection', async () => {
    const stdin = new FakeTerminal(); const stdout = new FakeOutput();
    const pending = setupInternals.selectMenu(stdin, stdout, [{ id: 'one', label: 'One' }]);
    send(stdin, '123456789');
    send(stdin, '\r');
    expect(await pending).toEqual({ id: 'one', label: 'One' });
  });

  test('renders with missing optional paths', async () => {
    const stdin = new FakeTerminal(); const stdout = new FakeOutput();
    const pending = setupInternals.selectMenu(stdin, stdout, [{ id: 'quit', label: 'Quit' }], 0, {});
    send(stdin, '\u0003');
    await expect(pending).resolves.toEqual({ id: 'quit', label: 'Quit' });
    expect(stdout.text).toContain('> 1. Quit');
  });

  test('falls back to configured paths when one optional path is absent', async () => {
    const entries = [{ id: 'quit', label: 'Quit' }];
    const firstStdin = new FakeTerminal(); const firstStdout = new FakeOutput();
    const first = setupInternals.selectMenu(firstStdin, firstStdout, entries, 0, { envPath: '/tmp/env' });
    send(firstStdin, '\u0003');
    await expect(first).resolves.toEqual(entries[0]);

    const secondStdin = new FakeTerminal(); const secondStdout = new FakeOutput();
    const second = setupInternals.selectMenu(secondStdin, secondStdout, entries, 0, { rootDir: '/tmp/root' });
    send(secondStdin, '\u0003');
    await expect(second).resolves.toEqual(entries[0]);
  });

  test('returns null when raw mode is unavailable', async () => {
    const stdin = {}; const stdout = new FakeOutput();
    await expect(setupInternals.selectMenu(stdin, stdout, [])).resolves.toBeNull();
  });
});

describe('interactive setup menu flow', () => {
  let directory;
  beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'agentx-setup-flow-')); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  const drive = async (readlineInput, values) => {
    for (const value of values) {
      await new Promise((resolve) => setTimeout(() => { readlineInput.emit('data', Buffer.from(`${value}\n`)); resolve(); }, 50));
    }
  };

  test('visits every menu item on a TTY without waiting indefinitely', async () => {
    const stdin = { isTTY: true }; const readlineInput = new FakeTerminal(); const stdout = new FakeOutput();
    const configPath = path.join(directory, '.agentx');
    const run = runSetup({ stdin, stdout, configPath, readlineInput });
    await drive(readlineInput, ['1', 'api-key', '2', '1', '3', '1', '4', '1', '5', '1', '6', '1', '7', '300000', '8']);
    await expect(Promise.race([run, new Promise((_, reject) => setTimeout(() => reject(new Error('setup flow timed out')), 2000))])).resolves.toBeUndefined();
    const saved = await readEnvState(configPath);
    expect(saved.values).toMatchObject({ AGENTX_API_KEY: 'api-key', AGENTX_COMPACTION_THRESHOLD: '300000' });
    expect(stdout.text).toContain('Warning: jumbo prompts cost 2x above 270k tokens.');
  }, 5000);

  test('loads persisted model over defaults and can re-select the default model', async () => {
    const stdin = { isTTY: true }; const readlineInput = new FakeTerminal(); const stdout = new FakeOutput();
    const configPath = path.join(directory, '.agentx');
    await writeEnvState(configPath, { AGENTX_MODEL: 'gpt-5.6-terra' });
    const run = runSetup({ stdin, stdout, configPath, readlineInput });
    await drive(readlineInput, ['2', 'gpt-5.6-luna', '8']);
    await expect(run).resolves.toBeUndefined();
    expect((await readEnvState(configPath)).values.AGENTX_MODEL).toBe('gpt-5.6-luna');
    expect(stdout.text).toContain('Model (gpt-5.6-terra)');
  }, 5000);

  test('accepts a textual setting choice', async () => {
    const stdin = { isTTY: true }; const readlineInput = new FakeTerminal(); const stdout = new FakeOutput();
    const configPath = path.join(directory, '.agentx');
    const run = runSetup({ stdin, stdout, configPath, readlineInput });
    await drive(readlineInput, ['2', 'gpt-5.6-terra', '8']);
    await expect(Promise.race([run, new Promise((_, reject) => setTimeout(() => reject(new Error('setup flow timed out')), 2000))])).resolves.toBeUndefined();
    expect((await readEnvState(configPath)).values.AGENTX_MODEL).toBe('gpt-5.6-terra');
    expect(stdout.text).toContain('Use 1-8, ↑/↓, or Enter.');
  }, 5000);

  test('uses the readline fallback and accepts textual choices', async () => {
    const stdin = { isTTY: true }; const readlineInput = new FakeTerminal(); const stdout = new FakeOutput();
    const configPath = path.join(directory, '.agentx');
    const run = runSetup({ stdin, stdout, configPath, readlineInput });
    await drive(readlineInput, ['unknown', 'model', 'gpt-5.6-terra', 'quit']);
    await expect(Promise.race([run, new Promise((_, reject) => setTimeout(() => reject(new Error('setup flow timed out')), 2000))])).resolves.toBeUndefined();
    expect((await readEnvState(configPath)).values.AGENTX_MODEL).toBe('gpt-5.6-terra');
    expect(stdout.text).toContain('Unknown option.');
  }, 5000);

  test('accepts blank compaction input without changing the value', async () => {
    const stdin = { isTTY: true }; const readlineInput = new FakeTerminal(); const stdout = new FakeOutput();
    const configPath = path.join(directory, '.agentx');
    const run = runSetup({ stdin, stdout, configPath, readlineInput });
    await drive(readlineInput, ['7', '', '8']);
    await expect(Promise.race([run, new Promise((_, reject) => setTimeout(() => reject(new Error('setup flow timed out')), 2000))])).resolves.toBeUndefined();
    expect((await readEnvState(configPath)).values.AGENTX_COMPACTION_THRESHOLD).toBeUndefined();
  }, 5000);

  test('retries blank API keys and rejects invalid compaction input', async () => {
    const stdin = { isTTY: true }; const readlineInput = new FakeTerminal(); const stdout = new FakeOutput();
    const configPath = path.join(directory, '.agentx');
    const run = runSetup({ stdin, stdout, configPath, readlineInput });
    await drive(readlineInput, ['1', '', 'valid-key', '7', 'not-a-number', '8']);
    await expect(Promise.race([run, new Promise((_, reject) => setTimeout(() => reject(new Error('setup flow timed out')), 2000))])).resolves.toBeUndefined();
    expect(stdout.text).toContain('API key is required.');
    expect(stdout.text).toContain('Enter a positive token count.');
    expect((await readEnvState(configPath)).values.AGENTX_API_KEY).toBe('valid-key');
  }, 5000);
});

describe('setup coverage edge cases', () => {
  test('handles malformed quoted values and empty env updates', () => {
    expect(setupInternals.decodeEnvValue('"bad\n"')).toBe('bad\n');
    expect(setupInternals.updateEnvText('', {})).toBe('');
    expect(setupInternals.updateEnvText(null, {})).toBe('');
  });

  test('selectChoice accepts an interactive selection and rejects invalid fallback input', async () => {
    const stdin = new FakeTerminal(); const stdout = new FakeOutput();
    const selected = setupInternals.selectChoice(stdin, stdout, { question: async () => 'nope' }, 'Model', ['one'], 'missing');
    send(stdin, '\r');
    expect(await selected).toBe('one');

    const fallback = await setupInternals.selectChoice({}, stdout, { question: async () => 'nope' }, 'Model', ['one'], 'missing');
    expect(fallback).toBeNull();
  });

  test('covers default setup arguments and empty saved content', async () => {
    const stdin = { isTTY: false }; const stdout = new FakeOutput();
    await runSetup({ stdin, stdout });
    const defaultStdout = new FakeOutput(); defaultStdout.isTTY = false;
    await runSetup({ stdout: defaultStdout });
    await writeEnvState(path.join(os.tmpdir(), `agentx-empty-${Date.now()}`), { AGENTX_API_KEY: '' });
  });

  test('writes an update using the existing file as the implicit base text', async () => {
    const file = path.join(os.tmpdir(), `agentx-existing-${Date.now()}`, '.agentx');
    await writeEnvState(file, { AGENTX_API_KEY: 'old-key' });
    await writeEnvState(file, { AGENTX_API_KEY: 'new-key' });
    expect((await readEnvState(file)).values.AGENTX_API_KEY).toBe('new-key');
  });
});

describe('setup final coverage paths', () => {
  test('takes the non-compaction menu path before quitting', async () => {
    const stdin = new FakeTerminal(); const stdout = new FakeOutput();
    const configPath = path.join(os.tmpdir(), `agentx-quit-${Date.now()}.agentx`);
    const run = runSetup({ stdin, stdout, configPath, readlineInput: new FakeTerminal() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.emit('data', Buffer.from('6'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.emit('data', Buffer.from('1'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.emit('data', Buffer.from('8'));
    await run;
    await rm(configPath, { force: true });
  });

  test('uses the default environment path and compact menu blank label', async () => {
    const state = await readEnvState();
    expect(state.filePath).toBe(setupPaths.envPath);
    expect(buildMenuEntries({ values: { AGENTX_API_KEY: '' } })[0].label).toContain('blank');
  });

  test('truncates oversized input and handles the compaction save path', async () => {
    const stdin = new FakeTerminal(); const stdout = new FakeOutput();
    const pending = setupInternals.selectMenu(stdin, stdout, [{ id: 'one', label: 'One' }]);
    stdin.emit('data', Buffer.from('xxxxxxxxx'));
    stdin.emit('data', Buffer.from('x'));
    stdin.emit('data', Buffer.from('\r'));
    expect(await pending).toEqual({ id: 'one', label: 'One' });

    const directory = await mkdtemp(path.join(os.tmpdir(), 'agentx-setup-final-'));
    try {
      const input = new FakeTerminal();
      const run = runSetup({ stdin: { isTTY: true }, stdout: new FakeOutput(), configPath: path.join(directory, '.agentx'), readlineInput: input });
      await new Promise((resolve) => setTimeout(resolve, 20));
      input.emit('data', Buffer.from('7\n'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      input.emit('data', Buffer.from('123456\n'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      input.emit('data', Buffer.from('8\n'));
      await run;
      expect((await readEnvState(path.join(directory, '.agentx'))).values.AGENTX_COMPACTION_THRESHOLD).toBe('123456');
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 5000);
});

describe('setup branch completion', () => {
  test('covers raw menu selection, compaction through the raw menu, and missing off handler', async () => {
    const stdin = new FakeTerminal(); delete stdin.off;
    const stdout = new FakeOutput();
    const pending = setupInternals.selectMenu(stdin, stdout, [{ id: 'quit', label: 'Quit' }]);
    stdin.emit('data', Buffer.from('\r'));
    expect(await pending).toEqual({ id: 'quit', label: 'Quit' });

    const menuInput = new FakeTerminal();
    const readlineInput = new FakeTerminal();
    const configPath = path.join(os.tmpdir(), `agentx-raw-${Date.now()}.agentx`);
    const run = runSetup({ stdin: menuInput, stdout: new FakeOutput(), configPath, readlineInput });
    await new Promise((resolve) => setTimeout(resolve, 20));
    menuInput.emit('data', Buffer.from('7'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    readlineInput.emit('data', Buffer.from('123456\n'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    menuInput.emit('data', Buffer.from('8'));
    await run;
    expect((await readEnvState(configPath)).values.AGENTX_COMPACTION_THRESHOLD).toBe('123456');
    await rm(configPath, { force: true });

    const modelMenu = new FakeTerminal();
    const modelInput = new FakeTerminal();
    const modelPath = path.join(os.tmpdir(), `agentx-model-${Date.now()}.agentx`);
    const modelRun = runSetup({ stdin: modelMenu, stdout: new FakeOutput(), configPath: modelPath, readlineInput: modelInput });
    await new Promise((resolve) => setTimeout(resolve, 20));
    modelMenu.emit('data', Buffer.from('2'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    modelMenu.emit('data', Buffer.from('1'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    modelMenu.emit('data', Buffer.from('8'));
    await modelRun;
    await rm(modelPath, { force: true });
  }, 5000);

  test('covers omitted runSetup arguments', async () => {
    const originalWrite = process.stdout.write;
    const originalStdinTTY = process.stdin.isTTY;
    const originalStdoutTTY = process.stdout.isTTY;
    process.stdout.write = () => true;
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false });
    try {
      await runSetup();
    } finally {
      process.stdout.write = originalWrite;
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: originalStdinTTY });
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalStdoutTTY });
    }
  });
});

test('covers setup path fallback when no home directory exists', async () => {
  jest.resetModules();
  await jest.unstable_mockModule('../src/platform.mjs', () => ({ getHomeDirectory: () => '' }));
  await jest.isolateModulesAsync(async () => {
    const { setupPaths } = await import('../src/setup.mjs');
    expect(setupPaths.envPath).toContain('.agentx');
    expect(setupPaths.mcpConfigPath).toContain('.agentx.mcp.json');
  });
});
