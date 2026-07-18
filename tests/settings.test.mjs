import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const readEnvState = jest.fn();
await jest.unstable_mockModule('../src/setup.mjs', () => ({ readEnvState }));
const { DEFAULT_SETTINGS, settingsFromEnv, applySettings, reloadSettings } = await import('../src/settings.mjs');


test('reads configured environment values and parses MCP servers', () => {
  const settings = settingsFromEnv({
    AGENTX_MODEL: 'model',
    AGENTX_REASONING_MODE: 'enabled',
    AGENTX_REASONING_EFFORT: 'high',
    AGENTX_REASONING_SUMMARY: 'null',
    AGENTX_OUTPUT_VERBOSITY: 'high',
    AGENTX_COMPACTION_THRESHOLD: '123',
    AGENTX_MCP_SERVERS: '[{\"url\":\"https://mcp\",\"label\":\"M\"}]',
  });
  expect(settings).toEqual({ model: 'model', reasoningMode: 'enabled', reasoningEffort: 'high', reasoningSummary: 'null', outputVerbosity: 'high', compactionThreshold: 123, mcpServers: [{ url: 'https://mcp', label: 'M' }] });
});

test('uses defaults for missing and invalid environment values', () => {
  expect(settingsFromEnv({ AGENTX_COMPACTION_THRESHOLD: 'not-a-number', AGENTX_MCP_SERVERS: '{bad' })).toEqual(DEFAULT_SETTINGS);
  expect(settingsFromEnv({ AGENTX_MCP_SERVERS: 'null' }).mcpServers).toEqual([]);
  expect(settingsFromEnv({ AGENTX_MCP_SERVERS: '' }).mcpServers).toEqual([]);
});

test('applies reasoning, text, compaction, and MCP settings', () => {
  const template = { model: 'old', reasoning: { existing: true }, text: { existing: true }, tools: [{ type: 'existing' }] };
  const result = applySettings(template, {
    model: 'new', reasoningMode: 'enabled', reasoningEffort: 'high', reasoningSummary: 'null', outputVerbosity: 'high', compactionThreshold: 456,
    mcpServers: [
      { url: 'https://bearer', label: 'Bearer', description: 'B', auth: { type: 'bearer', token: 'secret' } },
      { url: 'https://headers', label: 'Headers', description: 'H', auth: { type: 'headers' } },
      { url: 'https://headers-set', label: 'Headers set', auth: { type: 'headers', headers: { 'X-Test': 'yes' } } },
      { url: 'https://none', label: 'None', auth: { type: 'other' } },
    ],
  });
  expect(result).toEqual({ model: 'new', reasoning: { existing: true, mode: 'enabled', effort: 'high', summary: null }, text: { existing: true, verbosity: 'high' }, context_management: [{ type: 'compaction', compact_threshold: 456 }], tools: [
    { type: 'existing' },
    { type: 'mcp', server_url: 'https://bearer', server_label: 'Bearer', server_description: 'B', authorization: 'Bearer secret' },
    { type: 'mcp', server_url: 'https://headers', server_label: 'Headers', server_description: 'H', headers: {} },
    { type: 'mcp', server_url: 'https://headers-set', server_label: 'Headers set', server_description: undefined, headers: { 'X-Test': 'yes' } },
    { type: 'mcp', server_url: 'https://none', server_label: 'None', server_description: undefined },
  ] });
  expect(template).toEqual({ model: 'old', reasoning: { existing: true }, text: { existing: true }, tools: [{ type: 'existing' }] });
});

test('adds MCP tools to a template without an existing tools array', () => {
  const result = applySettings({}, { ...DEFAULT_SETTINGS, mcpServers: [{ url: 'https://mcp', label: 'M' }] });
  expect(result.tools).toEqual([{ type: 'mcp', server_url: 'https://mcp', server_label: 'M', server_description: undefined }]);
});

test('uses process environment when no environment is supplied', () => {
  const previous = process.env.AGENTX_MODEL;
  process.env.AGENTX_MODEL = 'environment-model';
  expect(settingsFromEnv().model).toBe('environment-model');
  if (previous === undefined) delete process.env.AGENTX_MODEL;
  else process.env.AGENTX_MODEL = previous;
});

test('uses environment settings when applySettings receives no settings', () => {
  const previous = process.env.AGENTX_MODEL;
  process.env.AGENTX_MODEL = 'default-argument-model';
  expect(applySettings({}).model).toBe('default-argument-model');
  if (previous === undefined) delete process.env.AGENTX_MODEL;
  else process.env.AGENTX_MODEL = previous;
});

test('applies settings without adding tools when no MCP servers exist', () => {
  expect(applySettings({}, { ...DEFAULT_SETTINGS, reasoningSummary: 'auto', mcpServers: [] })).not.toHaveProperty('tools');
});

describe('reloadSettings', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original };
    readEnvState.mockReset();
  });

  afterEach(() => {
    process.env = original;
  });

  test('loads persisted settings while preserving the API key', async () => {
    process.env.AGENTX_API_KEY = 'keep-me';
    process.env.AGENTX_MODEL = 'old-model';
    readEnvState.mockResolvedValue({ values: {
      AGENTX_API_KEY: 'do-not-load',
      AGENTX_MODEL: 'new-model',
      AGENTX_OUTPUT_VERBOSITY: 'high',
    } });

    await expect(reloadSettings()).resolves.toMatchObject({
      model: 'new-model',
      outputVerbosity: 'high',
    });
    expect(process.env.AGENTX_API_KEY).toBe('keep-me');
    expect(process.env.AGENTX_MODEL).toBe('new-model');
    expect(readEnvState).toHaveBeenCalledTimes(1);
  });
});
