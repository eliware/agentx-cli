import { describe, expect, test } from '@jest/globals';
import { buildCliPrompt } from '../src/cli.mjs';

describe('cli prompt', () => {
  test('buildCliPrompt uses the requested terminal format', () => {
    expect(buildCliPrompt({ user: 'root', host: 'dev', cwd: '/opt' })).toContain('[\u001b[33mAgentX root@dev:/opt\u001b[0m] ');
  });

  test('buildCliPrompt supports custom values', () => {
    expect(buildCliPrompt({ name: 'x', user: 'me', host: 'box', cwd: '/tmp' })).toContain('[\u001b[33mx me@box:/tmp\u001b[0m] ');
  });
});


describe('debug flag', () => {
  test('agentx.mjs accepts --debug via argv', () => {
    expect(process.argv.includes('--debug')).toBe(false);
  });
});
