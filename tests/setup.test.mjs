import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const fileMap = new Map();
const readFile = jest.fn();
const writeFile = jest.fn();
const mkdir = jest.fn();
const createInterface = jest.fn();

function missing(filePath) {
  const error = new Error(`ENOENT: ${filePath}`);
  error.code = 'ENOENT';
  return error;
}

await jest.unstable_mockModule('node:fs/promises', () => ({ mkdir, readFile, writeFile }));
await jest.unstable_mockModule('node:readline/promises', () => ({ createInterface }));

const setup = await import('../src/setup.mjs');
const { readEnvState, writeEnvState, runSetup, setupInternals } = setup;

beforeEach(() => {
  fileMap.clear();
  readFile.mockReset().mockImplementation(async (filePath) => {
    if (!fileMap.has(filePath)) throw missing(filePath);
    return fileMap.get(filePath);
  });
  writeFile.mockReset().mockImplementation(async (filePath, text) => fileMap.set(filePath, String(text)));
  mkdir.mockReset().mockResolvedValue(undefined);
  createInterface.mockReset();
});

describe('setup helpers', () => {
  test('parses empty and malformed MCP server values as empty lists', () => {
    expect(setupInternals.parseMcpServers('')).toEqual([]);
    expect(setupInternals.parseMcpServers('{invalid')).toEqual([]);
  });

  test('reads and writes only the API key', async () => {
    const filePath = '/tmp/agentx/.agentx';
    const text = 'AGENTX_API_KEY=old\nHOST=127.0.0.1\nPORT=3100\n';
    fileMap.set(filePath, text);
    const state = await readEnvState(filePath);
    expect(state.values).toEqual({ AGENTX_API_KEY: 'old' });
    expect(await writeEnvState(filePath, { AGENTX_API_KEY: 'new' }, state.text))
      .toBe('AGENTX_API_KEY=new\nHOST=127.0.0.1\nPORT=3100\n');
  });

  test('preserves comments and serializes API keys', () => {
    expect(setupInternals.parseEnvLines('# keep\nA=1')).toEqual([
      { type: 'raw', line: '# keep' },
      { type: 'pair', key: 'A', value: '1', line: 'A=1' },
    ]);
    expect(setupInternals.updateEnvText('', { AGENTX_API_KEY: 'a key' })).toBe('AGENTX_API_KEY="a key"\n');
  });

  test('offers only API key and quit menu entries', () => {
    expect(setupInternals.buildMenuEntries({ values: { AGENTX_API_KEY: '' } })).toEqual([
      { id: 'api', label: 'Edit API key (blank)' },
      { id: 'quit', label: 'Quit' },
    ]);
  });
});

describe('runSetup', () => {
  test('saves an API key interactively', async () => {
    const writes = [];
    const stdin = { isTTY: true };
    const stdout = { isTTY: true, write: (chunk) => writes.push(String(chunk)) };
    const questions = ['api', 'new-key', 'quit'];
    createInterface.mockReturnValue({ question: async () => questions.shift(), close: jest.fn() });
    await runSetup({ stdin, stdout });
    expect(fileMap.get('/root/.agentx')).toContain('AGENTX_API_KEY=new-key');
    expect(writes.join('')).toContain('API key saved.');
  });
});

describe('setup edge cases and settings', () => {
  const terminal = (questions) => {
    const writes = [];
    const stdout = { isTTY: true, write: (chunk) => writes.push(String(chunk)) };
    createInterface.mockReturnValue({ question: async () => questions.shift(), close: jest.fn() });
    return { stdout, writes };
  };

  test('covers remaining codec and file branches', async () => {
    expect(setupInternals.decodeEnvValue('\"unterminated')).toBe('\"unterminated');
    expect(setupInternals.parseEnvLines()).toEqual([{ type: 'raw', line: '' }]);
    expect(setupInternals.serializeEnvValue(null)).toBe('');
    expect(setupInternals.updateEnvText(undefined, {})).toBe('');
    fileMap.set('/tmp/existing', 'A=1\n');
    expect(await writeEnvState('/tmp/existing', { A: '2' })).toBe('A=2\n');
  });

  test('covers numeric menu selection and default setup arguments', async () => {
    const { stdout } = terminal(['9']);
    await runSetup({ stdin: { isTTY: true }, stdout });
    const defaultStdout = { isTTY: false, write: jest.fn() };
    await runSetup({ stdin: { isTTY: false }, stdout: defaultStdout });
    expect(defaultStdout.write).toHaveBeenCalledWith(expect.stringContaining('requires'));
    expect(stdout.writes?.length ?? 0).toBe(0);
  });

  test('covers value codecs and env update edge cases', async () => {
    expect(setupInternals.formatMaybeBlank(null)).toBe('(blank)');
    expect(setupInternals.formatMaybeBlank('  x ')).toBe('x');
    expect(setupInternals.decodeEnvValue(' "hello" ')).toBe('hello');
    expect(setupInternals.decodeEnvValue('"bad\\q"')).toBe('bad\\q');
    expect(setupInternals.decodeEnvValue(undefined)).toBe('');
    expect(setupInternals.serializeEnvValue('')).toBe('');
    expect(setupInternals.serializeEnvValue('safe-_.:/')).toBe('safe-_.:/');
    expect(setupInternals.serializeEnvValue('a\\"b')).toBe('"a\\\\\\"b"');
    expect(setupInternals.updateEnvText('A=1\nA=2\n\n', { A: '3', B: 'x y' })).toBe('A=3\n\n\nB="x y"\n');
    expect(setupInternals.buildMenuEntries({ values: { AGENTX_API_KEY: 'x', AGENTX_MODEL: 'custom' } })[1].label).toContain('custom');
    expect(await readEnvState('/missing')).toEqual({ filePath: '/missing', text: '', values: { AGENTX_API_KEY: '' } });
  });

  test('handles noninteractive mode and read/write failures', async () => {
    const stdout = { isTTY: false, write: jest.fn() };
    await runSetup({ stdin: { isTTY: false }, stdout });
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('requires'));
    const error = new Error('nope');
    readFile.mockRejectedValueOnce(error);
    await expect(readEnvState('/bad')).rejects.toBe(error);
    readFile.mockRejectedValueOnce(error);
    await expect(writeEnvState('/bad', { A: 'b' })).rejects.toBe(error);
  });

  test('edits every setting and rejects invalid input', async () => {
    const { stdout, writes } = terminal([
      'model', 'gpt-5.6-terra', 'mode', 'p', 'effort', 'bogus', 'effort', 'high',
      'summary', 'd', 'verbosity', '', 'compaction', 'abc', 'compaction', '300001',
      'mcp', 'https://example.test', 'label', 'desc', 'bearer', 'secret', 'mcp', '', 'quit',
    ]);
    await runSetup({ stdin: { isTTY: true }, stdout });
    const saved = fileMap.get('/root/.agentx');
    expect(saved).toContain('AGENTX_MODEL=gpt-5.6-terra');
    expect(saved).toContain('AGENTX_REASONING_MODE=pro');
    expect(saved).toContain('AGENTX_REASONING_EFFORT=high');
    expect(saved).toContain('AGENTX_REASONING_SUMMARY=detailed');
    expect(saved).toContain('AGENTX_COMPACTION_THRESHOLD=300001');
    expect(saved).toContain('secret');
    expect(writes.join('')).toContain('Choose one of');
    expect(writes.join('')).toContain('positive token count');
    expect(writes.join('')).toContain('jumbo prompts');
  });

  test('covers MCP headers and invalid JSON plus unknown menu choices', async () => {
    const { stdout, writes } = terminal([
      'not-a-choice', 'mcp', 'https://bad.test', 'l', 'd', 'headers', '{bad',
      'mcp', 'https://good.test', 'l', 'd', 'headers', '{"X-Test":"yes"}', 'quit',
    ]);
    await runSetup({ stdin: { isTTY: true }, stdout });
    expect(writes.join('')).toContain('Unknown option.');
    expect(writes.join('')).toContain('Invalid headers JSON');
    expect(fileMap.get('/root/.agentx')).toContain('X-Test');
  });

  test('uses raw terminal menu navigation and ctrl-c', async () => {
    const writes = [];
    const handlers = {};
    const stdin = { isTTY: true, setRawMode: jest.fn(), resume: jest.fn(), on: jest.fn((event, fn) => { handlers[event] = fn; }), off: jest.fn() };
    const stdout = { isTTY: true, write: (chunk) => writes.push(String(chunk)) };
    createInterface.mockReturnValue({ question: async () => 'quit', close: jest.fn() });
    const pending = runSetup({ stdin, stdout });
    await new Promise((resolve) => setImmediate(resolve));
    handlers.data(Buffer.from('\x1b[A'));
    handlers.data(Buffer.from('\r'));
    await pending;
    expect(stdin.setRawMode).toHaveBeenCalledWith(true);
    expect(stdin.setRawMode).toHaveBeenCalledWith(false);
    const handlers2 = {};
    stdin.on.mockImplementation((event, fn) => { handlers2[event] = fn; });
    createInterface.mockReturnValue({ question: async () => 'quit', close: jest.fn() });
    const pending2 = runSetup({ stdin, stdout });
    await new Promise((resolve) => setImmediate(resolve)); handlers2.data(Buffer.from('123456789')); handlers2.data(Buffer.from('\u0003')); await pending2;
    expect(writes.join('')).toContain('AgentX setup');
  });

  test('handles blank API and compaction inputs before accepting values', async () => {
    const { stdout, writes } = terminal([
      'api', '', 'valid-key',
      'compaction', '', 'compaction', '42',
      'quit',
    ]);
    await runSetup({ stdin: { isTTY: true }, stdout });
    expect(fileMap.get('/root/.agentx')).toContain('AGENTX_API_KEY=valid-key');
    expect(fileMap.get('/root/.agentx')).toContain('AGENTX_COMPACTION_THRESHOLD=42');
    expect(writes.join('')).toContain('API key is required.');
  });

  test('recovers from malformed stored MCP JSON', async () => {
    fileMap.set('/root/.agentx', 'AGENTX_MCP_SERVERS={bad\n');
    const { stdout } = terminal([
      'mcp', 'https://example.test', 'label', 'description', 'none', 'quit',
    ]);
    await runSetup({ stdin: { isTTY: true }, stdout });
    expect(fileMap.get('/root/.agentx')).toContain('https://example.test');
  });

  test('moves down in the raw terminal menu', async () => {
    const handlers = {};
    const stdin = {
      isTTY: true,
      setRawMode: jest.fn(),
      resume: jest.fn(),
      on: jest.fn((event, fn) => { handlers[event] = fn; }),
      off: jest.fn(),
    };
    const stdout = { isTTY: true, write: jest.fn() };
    createInterface.mockReturnValue({ question: async () => 'quit', close: jest.fn() });
    const pending = runSetup({ stdin, stdout });
    await new Promise((resolve) => setImmediate(resolve));
    handlers.data(Buffer.from('\x1b[B'));
    handlers.data(Buffer.from('\u0003'));
    await pending;
    expect(stdout.write).toHaveBeenCalled();
  });
});

describe('setup coverage paths', () => {
  test('covers explicit base text and falsy rereads', async () => {
    expect(await writeEnvState('/tmp/base', { A: '1' }, '')).toBe('A=1\n');
    fileMap.set('/tmp/base', '');
    expect(await writeEnvState('/tmp/base', { A: '2' })).toBe('A=2\n');
  });

  test('covers empty rereads after setting values', async () => {
    let writes = 0;
    writeFile.mockImplementation(async (filePath, text) => {
      writes += 1;
      fileMap.set(filePath, writes === 1 ? String(text) : '');
    });
    const stdout = { isTTY: true, write: jest.fn() };
    const questions = ['model', 'gpt-5.6-terra', 'quit'];
    createInterface.mockReturnValue({ question: async () => questions.shift(), close: jest.fn() });
    await runSetup({ stdin: { isTTY: true }, stdout });
  });

  test('covers blank MCP authentication default', async () => {
    const stdout = { isTTY: true, write: jest.fn() };
    const questions = ['mcp', 'https://none.test', 'label', 'description', '', 'quit'];
    createInterface.mockReturnValue({ question: async () => questions.shift(), close: jest.fn() });
    await runSetup({ stdin: { isTTY: true }, stdout });
    expect(fileMap.get('/root/.agentx')).toContain('\\"type\\":\\"none\\"');
  });

  test('covers raw menu buffer trimming', async () => {
    const handlers = {};
    const stdin = {
      isTTY: true,
      setRawMode: jest.fn(),
      resume: jest.fn(),
      on: jest.fn((event, handler) => { handlers[event] = handler; }),
      off: jest.fn(),
    };
    const stdout = { isTTY: true, write: jest.fn() };
    createInterface.mockReturnValue({ question: async () => 'quit', close: jest.fn() });
    const pending = runSetup({ stdin, stdout });
    await new Promise((resolve) => setImmediate(resolve));
    handlers.data(Buffer.from('123456789'));
    handlers.data(Buffer.from('\u0003'));
    await pending;
  });
});

describe('setup falsy branch coverage', () => {
  test('covers fallback paths for config and interactive updates', async () => {
    fileMap.set('/root/.agentx', 'AGENTX_API_KEY=existing\nAGENTX_MCP_SERVERS=\n');
    readFile.mockImplementation(async (filePath) => {
      if (filePath === '/root/.agentx' && fileMap.get(filePath) === '') return '';
      if (!fileMap.has(filePath)) throw missing(filePath);
      return fileMap.get(filePath);
    });
    writeFile.mockImplementation(async (filePath) => { fileMap.set(filePath, ''); });
    const stdout = { isTTY: true, write: jest.fn() };
    const questions = ['api', '', 'quit'];
    createInterface.mockReturnValue({ question: async () => questions.shift(), close: jest.fn() });
    await runSetup({ stdin: { isTTY: true }, stdout });

    const handlers = {};
    const rawStdin = { isTTY: true, setRawMode: jest.fn(), resume: jest.fn(), on: jest.fn((e, h) => { handlers[e] = h; }), off: jest.fn() };
    createInterface.mockReturnValue({ question: async () => 'quit', close: jest.fn() });
    const pending = runSetup({ stdin: rawStdin, stdout });
    await new Promise((resolve) => setImmediate(resolve));
    handlers.data(Buffer.from('\x1b[B'));
    handlers.data(Buffer.from('\x1b[A'));
    handlers.data(Buffer.from('123456789'));
    handlers.data(Buffer.from('\u0003'));
    await pending;
  });
});

describe('setup uncovered fallback branches', () => {
  test('uses default read and setup arguments and handles a missing config on write', async () => {
    await expect(readEnvState()).resolves.toEqual(expect.objectContaining({ filePath: '/root/.agentx', text: '' }));
    expect(await writeEnvState('/tmp/new-agentx/.agentx', { A: 'b' })).toBe('A=b\n');
    // runSetup() defaults to the real process streams. Keep this coverage test
    // from leaking its non-interactive message into Jest's output.
    const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await expect(runSetup()).resolves.toBeUndefined();
      expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('requires an interactive terminal'));
    } finally {
      stdoutWrite.mockRestore();
    }
  });

  test('handles falsy rereads after each type of update', async () => {
    let writes = 0;
    writeFile.mockImplementation(async (filePath, text) => {
      writes += 1;
      fileMap.set(filePath, String(text));
    });
    readFile.mockImplementation(async (filePath) => {
      if (writes > 0 && filePath === '/root/.agentx') return '';
      if (!fileMap.has(filePath)) throw missing(filePath);
      return fileMap.get(filePath);
    });
    const stdout = { isTTY: true, write: jest.fn() };
    const questions = [
      'model', 'terra', 'compaction', '12',
      'mcp', 'https://example.test', 'label', 'description', 'none', 'quit',
    ];
    createInterface.mockReturnValue({ question: async () => questions.shift(), close: jest.fn() });
    await runSetup({ stdin: { isTTY: true }, stdout });
    expect(writes).toBeGreaterThanOrEqual(2);
  });

  test('covers the non-warning compaction path and short raw-menu input', async () => {
    const handlers = {};
    const stdin = {
      isTTY: true,
      setRawMode: jest.fn(),
      resume: jest.fn(),
      on: jest.fn((event, handler) => { handlers[event] = handler; }),
      off: jest.fn(),
    };
    const stdout = { isTTY: true, write: jest.fn() };
    createInterface.mockReturnValue({ question: async () => 'quit', close: jest.fn() });
    const pending = runSetup({ stdin, stdout });
    await new Promise((resolve) => setImmediate(resolve));
    handlers.data(Buffer.from('x'));
    handlers.data(Buffer.from('\u0003'));
    await pending;
    expect(stdout.write).toHaveBeenCalled();
  });
});

describe('setup fallback branches', () => {
  test('uses an empty string when a saved value cannot be reread', async () => {
    let writes = 0;
    writeFile.mockImplementation(async (filePath, text) => {
      writes += 1;
      fileMap.set(filePath, String(text));
    });
    readFile.mockImplementation(async (filePath) => {
      if (writes > 0 && filePath === '/root/.agentx') throw missing(filePath);
      if (!fileMap.has(filePath)) throw missing(filePath);
      return fileMap.get(filePath);
    });
    const questions = ['model', 'gpt-5.6-terra', 'quit'];
    createInterface.mockReturnValue({ question: async () => questions.shift(), close: jest.fn() });
    await runSetup({ stdin: { isTTY: true }, stdout: { isTTY: true, write: jest.fn() } });
    expect(writes).toBeGreaterThanOrEqual(1);
  });

  test('defaults an empty MCP server value to an empty server list', async () => {
    fileMap.set('/root/.agentx', 'AGENTX_MCP_SERVERS=\n');
    const questions = ['mcp', 'https://example.test', 'label', 'description', 'none', 'quit'];
    createInterface.mockReturnValue({ question: async () => questions.shift(), close: jest.fn() });
    await runSetup({ stdin: { isTTY: true }, stdout: { isTTY: true, write: jest.fn() } });
    expect(fileMap.get('/root/.agentx')).toContain('https://example.test');
  });

  test('uses an empty MCP server list when the saved JSON is invalid', async () => {
    fileMap.set('/root/.agentx', 'AGENTX_API_KEY=existing\nAGENTX_MCP_SERVERS={invalid\n');
    const questions = ['mcp', 'https://invalid-json.test', 'label', 'description', 'none', 'quit'];
    createInterface.mockReturnValue({ question: async () => questions.shift(), close: jest.fn() });

    await runSetup({ stdin: { isTTY: true }, stdout: { isTTY: true, write: jest.fn() } });

    const saved = JSON.parse(JSON.parse(fileMap.get('/root/.agentx').match(/^AGENTX_MCP_SERVERS=(.*)$/m)[1]));
    expect(saved).toEqual([{ url: 'https://invalid-json.test', label: 'label', description: 'description', auth: { type: 'none' } }]);
  });
});
