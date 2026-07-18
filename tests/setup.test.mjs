import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

  test('reads missing and populated files and writes updates', async () => {
    const file = path.join(directory, 'nested', '.agentx');
    expect((await readEnvState(file)).values.AGENTX_API_KEY).toBe('');
    await writeEnvState(file, { AGENTX_API_KEY: 'key', AGENTX_MODEL: 'gpt-5.6-sol' });
    await writeEnvState(file, { AGENTX_MODEL: 'gpt-5.6-terra' });
    const state = await readEnvState(file);
    expect(state.values).toMatchObject({ AGENTX_API_KEY: 'key', AGENTX_MODEL: 'gpt-5.6-terra' });
    expect(await readFile(file, 'utf8')).toContain('AGENTX_MODEL=gpt-5.6-terra');
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
      await new Promise((resolve) => setTimeout(() => { readlineInput.emit('data', Buffer.from(`${value}\n`)); resolve(); }, 20));
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
    process.stdout.write = () => true;
    try {
      await runSetup();
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
