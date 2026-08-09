import { describe, expect, test } from '@jest/globals';
import { access, mkdir, mkdtemp, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cleanupStaleOneShotStates,
  createPendingResponse,
  getToolCallId,
  persistCheckpoint,
  readLatestCheckpoint,
} from '../src/agent/checkpoint.mjs';

const tempDir = () => mkdtemp(join(tmpdir(), 'agentx-checkpoint-'));
const state = {
  response_id: 'r1',
  usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 },
  last_user_message: 'user',
  last_assistant_message: 'assistant',
  history: [{ response_id: 'r1', timestamp: 'now' }],
};

describe('agent checkpoint helpers', () => {
  test('normalizes pending responses and tool ids', () => {
    expect(createPendingResponse({ response_id: 'r1', pending_tool_calls: [{ type: 'shell_call' }] })).toEqual({ id: 'r1', output: [{ type: 'shell_call' }] });
    expect(createPendingResponse({ response_id: undefined, pending_tool_calls: 'invalid' })).toEqual({ id: '', output: [] });
    expect(getToolCallId({ call_id: ' c1 ' })).toBe('c1');
    expect(getToolCallId({ id: 'c2' })).toBe('c2');
    expect(getToolCallId({})).toBe('');
  });

  test('cleans stale, preserves fresh/nonmatching entries, and handles missing directory', async () => {
    const cwd = await tempDir();
    const stale = join(cwd, '.agentx_responseid.oneshot-old');
    const fresh = join(cwd, '.agentx_responseid.oneshot-new');
    const other = join(cwd, 'other');
    const nested = join(cwd, '.agentx_responseid.oneshot-dir');
    await writeFile(stale, '{}');
    await writeFile(fresh, '{}');
    await writeFile(other, '{}');
    await mkdir(nested);
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(stale, old, old);
    expect(await cleanupStaleOneShotStates(cwd)).toBeUndefined();
    await expect(access(stale)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(fresh)).resolves.toBeUndefined();
    expect(await cleanupStaleOneShotStates(join(cwd, 'missing'))).toBeUndefined();
  });

  test('propagates cleanup filesystem errors', async () => {
    const cwd = await tempDir();
    const file = join(cwd, 'not-a-directory');
    await writeFile(file, '{}');
    await expect(cleanupStaleOneShotStates(file)).rejects.toBeTruthy();
  });

  test('reads checkpoint, fallback history, and missing fallback', async () => {
    const cwd = await tempDir();
    const checkpoint = join(cwd, 'checkpoint');
    const fallback = join(cwd, 'fallback');
    await persistCheckpoint(checkpoint, state);
    await expect(readLatestCheckpoint(checkpoint, fallback)).resolves.toMatchObject({ response_id: 'r1' });
    await writeFile(checkpoint, JSON.stringify({ response_id: '' }));
    await persistCheckpoint(fallback, { history: [{ response_id: 'fallback', usage: { turns: 2 }, last_user_message: 'u', last_assistant_message: 'a' }] });
    await expect(readLatestCheckpoint(checkpoint, fallback)).resolves.toMatchObject({ response_id: 'fallback', pending_tool_calls: [], history: [{ response_id: 'fallback' }] });
    await expect(readLatestCheckpoint(checkpoint, '')).resolves.toBeNull();
    await persistCheckpoint(fallback, { history: [] });
    await expect(readLatestCheckpoint(checkpoint, fallback)).resolves.toBeNull();
  });

  test('persists a sanitized checkpoint', async () => {
    const cwd = await tempDir();
    const checkpoint = join(cwd, 'checkpoint');
    await persistCheckpoint(checkpoint, state);
    const parsed = JSON.parse(await (await import('node:fs/promises')).readFile(checkpoint, 'utf8'));
    expect(parsed).toMatchObject({ response_id: 'r1', pending_cli_transcript: '', pending_tool_calls: [], history: state.history });
  });
});
