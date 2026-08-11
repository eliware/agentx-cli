import { describe, expect, jest, test } from '@jest/globals';
import { formatQuickHelp, getPackageVersion, hasFlag, normalizeOutputFlags, parseCliArgs } from '../src/cli.mjs';

const packageVersion = getPackageVersion();

describe('cli helpers', () => {
  test('hasFlag matches any supported alias', () => {
    expect(hasFlag(['--debug', 'hello'], ['--debug'])).toBe(true);
    expect(hasFlag(['--yolo'], ['--yolo'])).toBe(true);
    expect(hasFlag(['-h'], ['--help', '-h', '-?'])).toBe(true);
    expect(hasFlag(['hello'], ['--help', '-h', '-?'])).toBe(false);
  });

  test('parses long and stacked output flags without sending them as chat text', () => {
    const parsed = parseCliArgs(['-qur', '--no-colors', 'review', 'this']);
    expect(parsed.messageArgs).toEqual(['review', 'this']);
    expect(parsed.flags).toMatchObject({ quiet: true, noUsage: true, noReasoning: true, noColors: true });
  });

  test('supports end-of-options passthrough and unknown message arguments', () => {
    expect(parseCliArgs(['--', '--no-usage', 'message'])).toMatchObject({ messageArgs: ['--no-usage', 'message'] });
    expect(parseCliArgs(['--unknown'])).toMatchObject({ messageArgs: ['--unknown'] });
  });

  test('uses defaults when CLI arguments are omitted', () => {
    expect(parseCliArgs().messageArgs).toEqual([]);
    expect(normalizeOutputFlags().quiet).toBe(false);
  });

  test('quiet enables all output suppressions except reasoning and colors', () => {
    expect(normalizeOutputFlags({ quiet: true })).toMatchObject({
      quiet: true, noUsage: true, noTimers: true, noShellCalls: true, noToolCalls: true, noMcp: true, noWebsearch: true,
      noReasoning: false, noColors: false,
    });
  });

  test('getPackageVersion reads the package version', () => {
    expect(packageVersion).toMatch(/^\d+\.\d+\.\d+$/);
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
    expect(help).toContain(`AgentX ${packageVersion}`);
  });

  test('formatQuickHelp includes the core flags and commands', () => {
    const help = formatQuickHelp('9.9.9');
    expect(help).toContain('AgentX 9.9.9');
    expect(help).toContain('--help, -h, -?');
    expect(help).toContain('--version, -v');
    expect(help).toContain('--debug');
    expect(help).toContain('--yolo');
  });
});
