import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const readEnvState = jest.fn();
await jest.unstable_mockModule('../src/setup.mjs', () => ({ readEnvState }));
const { DEFAULT_SETTINGS, settingsFromEnv, applySettings, reloadSettings } = await import('../src/settings.mjs');


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
