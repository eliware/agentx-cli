import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const readEnvState = jest.fn();
await jest.unstable_mockModule('../src/setup.mjs', () => ({ readEnvState }));
const { DEFAULT_SETTINGS, settingsFromEnv, formatStartupSettings, applySettings, reloadSettings } = await import('../src/settings.mjs');


test('formats startup settings as a compact JSON message', () => {
  expect(JSON.parse(formatStartupSettings({
    model: 'gpt-5.6-luna',
    reasoningMode: 'standard',
    reasoningEffort: 'low',
    reasoningSummary: 'auto',
    outputVerbosity: 'low',
    compactionThreshold: 200000,
  }))).toEqual({ model: 'gpt-5.6-luna', mode: 'standard', effort: 'low', summary: 'auto', verbosity: 'low', compaction: '200000' });
});

test('uses defaults when environment settings are absent', () => {
  expect(settingsFromEnv({})).toEqual(DEFAULT_SETTINGS);
});

test('formats environment defaults when no settings are supplied', () => {
  expect(JSON.parse(formatStartupSettings())).toEqual({
    model: DEFAULT_SETTINGS.model,
    mode: DEFAULT_SETTINGS.reasoningMode,
    effort: DEFAULT_SETTINGS.reasoningEffort,
    summary: DEFAULT_SETTINGS.reasoningSummary,
    verbosity: DEFAULT_SETTINGS.outputVerbosity,
    compaction: String(DEFAULT_SETTINGS.compactionThreshold),
  });
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

test('converts the null summary setting to null', () => {
  expect(applySettings({}, { ...DEFAULT_SETTINGS, reasoningSummary: 'null' })).toMatchObject({
    reasoning: {
      summary: null,
    },
  });
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
