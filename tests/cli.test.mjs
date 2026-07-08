import { describe, expect, jest, test } from '@jest/globals';
import { formatQuickHelp, getPackageVersion, hasFlag } from '../src/cli.mjs';

describe('cli helpers', () => {
  test('hasFlag matches any supported alias', () => {
    expect(hasFlag(['--debug', 'hello'], ['--debug'])).toBe(true);
    expect(hasFlag(['-h'], ['--help', '-h', '-?'])).toBe(true);
    expect(hasFlag(['hello'], ['--help', '-h', '-?'])).toBe(false);
  });

  test('getPackageVersion reads the package version', () => {
    expect(getPackageVersion()).toBe('1.1.10');
  });

  test('getPackageVersion falls back to unknown when the package has no version', async () => {
    jest.resetModules();
    await jest.unstable_mockModule('node:fs', () => ({
      readFileSync: () => JSON.stringify({ name: '@eliware/agentx' }),
    }));

    const { getPackageVersion: mockedGetPackageVersion } = await import('../src/cli.mjs');
    expect(mockedGetPackageVersion()).toBe('unknown');
  });


  test('formatQuickHelp uses the package version by default', () => {
    const help = formatQuickHelp();
    expect(help).toContain('AgentX 1.1.10');
  });

  test('formatQuickHelp includes the core flags and commands', () => {
    const help = formatQuickHelp('9.9.9');
    expect(help).toContain('AgentX 9.9.9');
    expect(help).toContain('--help, -h, -?');
    expect(help).toContain('--version, -v');
    expect(help).toContain('--debug');
  });
});
