import { jest, expect, test } from '@jest/globals';

await jest.unstable_mockModule('../src/platform.mjs', () => ({
  getHomeDirectory: () => '',
}));

const { setupPaths } = await import('../src/setup.mjs');

test('uses the repository root when no home directory is available', () => {
  expect(setupPaths.envPath).toBe(`${setupPaths.rootDir}/.agentx`);
  expect(setupPaths.mcpConfigPath).toBe(`${setupPaths.rootDir}/.agentx.mcp.json`);
});
