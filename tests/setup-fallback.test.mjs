import path from 'node:path';
import { jest, expect, test } from '@jest/globals';

await jest.unstable_mockModule('../src/platform.mjs', () => ({
  getHomeDirectory: () => '',
}));

const { setupPaths } = await import('../src/setup.mjs');

test('uses the repository root when no home directory is available', () => {
  expect(setupPaths.envPath).toBe(path.join(setupPaths.rootDir, '.agentx'));
  expect(setupPaths.mcpConfigPath).toBe(path.join(setupPaths.rootDir, '.agentx.mcp.json'));
});
