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
