import { describe, expect, test } from '@jest/globals';
import { existsSync, mkdirSync, utimesSync } from 'node:fs';
import { cleanupStaleOneShotStates, clearSession, persistCheckpoint, persistResponseState, readLatestCheckpoint, readSessionState } from '../src/session-state.mjs';
import { cleanupTempDir, makeTempDir, makeFile } from './test-helpers.mjs';

describe('session state', () => {
  test('persists, reads and clears state files', async () => {
    const tmp = makeTempDir('agentx-state-');
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await persistResponseState(statePath, { response_id: 'resp-1', usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 }, last_user_message: 'hello', last_assistant_message: 'hi', pending_cli_transcript: '', pending_tool_calls: [{ type: 'function_call', name: 'custom_tool', call_id: 'call-1', arguments: '{"p":[{"s":["echo hi"]}]}' }] });
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: 'resp-1', usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 }, last_user_message: 'hello', last_assistant_message: 'hi', pending_cli_transcript: '', pending_tool_calls: [{ type: 'function_call', name: 'custom_tool', call_id: 'call-1', arguments: '{"p":[{"s":["echo hi"]}]}' }] });

      await makeFile(tmp, '.agentx_responseid', 'resp-legacy\n');
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: 'resp-legacy', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [] });

      await makeFile(tmp, '.agentx_responseid', '');
      await expect(readSessionState(statePath)).resolves.toBeNull();

      await clearSession(statePath);
      expect(existsSync(statePath)).toBe(false);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('cleans stale one-shot state files but preserves recent files', async () => {
    const tmp = makeTempDir('agentx-state-cleanup-');
    try {
      const stale = makeFile(tmp, '.agentx_responseid.oneshot-old', 'old');
      const recent = makeFile(tmp, '.agentx_responseid.oneshot-new', 'new');
      mkdirSync(`${tmp}/.agentx_responseid.oneshot-directory`);
      const now = Date.now();
      utimesSync(stale, new Date(now - 2 * 60 * 60 * 1000), new Date(now - 2 * 60 * 60 * 1000));
      expect(await cleanupStaleOneShotStates(tmp, now)).toBe(1);
      expect(existsSync(stale)).toBe(false);
      expect(existsSync(recent)).toBe(true);
    } finally { cleanupTempDir(tmp); }
  });

  test('handles missing and invalid cleanup paths', async () => {
    const tmp = makeTempDir('agentx-state-missing-');
    const file = makeFile(tmp, 'not-a-directory', 'x');
    try {
      await expect(cleanupStaleOneShotStates(`${tmp}/missing`)).resolves.toBe(0);
      await expect(cleanupStaleOneShotStates(file)).rejects.toBeTruthy();
    } finally { cleanupTempDir(tmp); }
  });

  test('persists empty values when no state is supplied', async () => {
    const tmp = makeTempDir('agentx-state-');
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await persistResponseState(statePath, undefined);
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: '', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [] });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('falls back from primitive JSON values', async () => {
    const tmp = makeTempDir('agentx-state-');
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await makeFile(tmp, '.agentx_responseid', '42');
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: '42', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [] });
    } finally {
      cleanupTempDir(tmp);
    }
  });



  test('normalizes primitive pending tool calls and fallback metadata', async () => {
    const tmp = makeTempDir('agentx-state-');
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await makeFile(tmp, '.agentx_responseid', JSON.stringify({
        response_id: 'resp-raw',
        pending_tool_calls: [null, 42, { type: 'function_call', id: 'fallback-id', input: 7, arguments: 8 }, { type: 'function_call', input: 9, arguments: 10 }],
      }));
      await expect(readSessionState(statePath)).resolves.toEqual({
        response_id: 'resp-raw',
        usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 },
        last_user_message: '',
        last_assistant_message: '',
        pending_cli_transcript: '',
        pending_tool_calls: [{ type: 'function_call', id: 'fallback-id', input: 7, arguments: 8 }, { type: 'function_call', input: 9, arguments: 10 }],
      });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('falls back when pending tool calls cannot be cloned', async () => {
    const tmp = makeTempDir('agentx-state-');
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      const first = { type: 'function_call', name: 'custom_tool', call_id: 'call-1' };
      first.self = first;
      const second = { id: 'fallback-id', input: 7, arguments: 8 };
      second.self = second;
      const third = {};
      third.self = third;
      await persistResponseState(statePath, { response_id: 'resp-circular', pending_tool_calls: [first, second, third] });
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: 'resp-circular', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [{ type: 'function_call', name: 'custom_tool', call_id: 'call-1', input: undefined, arguments: undefined }, { type: 'function_call', name: undefined, call_id: 'fallback-id', input: '7', arguments: '8' }, { type: 'function_call', name: undefined, call_id: '', input: undefined, arguments: undefined }] });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('normalizes JSON, legacy text and malformed content', async () => {
    const tmp = makeTempDir('agentx-state-');
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await makeFile(tmp, '.agentx_responseid', '{"response_id":"42"}\n');
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: '42', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [] });

      await makeFile(tmp, '.agentx_responseid', 'not-json');
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: 'not-json', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [] });

      await makeFile(tmp, '.agentx_responseid', '   ');
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: '', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [] });
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// Exercise optional and malformed persisted metadata branches.
describe('session state edge normalization', () => {
  test('normalizes history entries and optional flags', async () => {
    const tmp = makeTempDir('agentx-state-');
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await makeFile(tmp, '.agentx_responseid', JSON.stringify({
        response_id: 'resp-history',
        history: [null, {}, { response_id: '', user_preview: 'discarded' }, { response_id: 'h0' }, {
          response_id: 'h1', timestamp: 7, user_preview: 42, assistant_preview: null,
          usage: { inputTokens: '1', cachedTokens: '2', outputTokens: '3', turns: '4' },
          last_user_message: 5, last_assistant_message: false,
        }],
        failed_response: 1,
      }));
      await expect(readSessionState(statePath)).resolves.toEqual({
        response_id: 'resp-history',
        usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 },
        last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [],
        history: [{ response_id: 'h0', timestamp: '', user_preview: '', assistant_preview: '', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '' }, { response_id: 'h1', timestamp: '7', user_preview: '42', assistant_preview: '', usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 }, last_user_message: '5', last_assistant_message: 'false' }],
        failed_response: true,
      });
      await persistResponseState(statePath, { history: [{ response_id: 'backup', timestamp: 't' }], rollback_backup: [{ response_id: 'discarded', timestamp: 'd' }] });
      await expect(readSessionState(statePath)).resolves.toMatchObject({ rollback_backup: [{ response_id: 'discarded', timestamp: 'd' }] });
    } finally { cleanupTempDir(tmp); }
  });

  test('normalizes execution journal records', async () => {
    const tmp = makeTempDir('agentx-state-');
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await makeFile(tmp, '.agentx_responseid', JSON.stringify({
        response_id: 'resp-journal',
        execution_journal: [null, { identity: 42, status: 'started', response_id: 7, updated_at: 9 }, { identity: 8 }, { identity: '', status: 'completed' }, { identity: null }],
      }));
      await expect(readSessionState(statePath)).resolves.toMatchObject({
        execution_journal: [{ identity: '42', status: 'started', response_id: '7', updated_at: '9' }, { identity: '8', status: 'pending', response_id: '', updated_at: '' }],
      });
    } finally { cleanupTempDir(tmp); }
  });

  test('normalizes non-array execution journals', async () => {
    const tmp = makeTempDir('agentx-state-journal-');
    try {
      await makeFile(tmp, '.agentx_responseid', JSON.stringify({ response_id: 'resp', execution_journal: 'bad' }));
      await expect(readSessionState(`${tmp}/.agentx_responseid`)).resolves.toMatchObject({ execution_journal: [] });
    } finally { cleanupTempDir(tmp); }
  });

  test('handles non-array history and absent optional pending values', async () => {
    const tmp = makeTempDir('agentx-state-');
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await makeFile(tmp, '.agentx_responseid', JSON.stringify({ response_id: 'resp', history: 'bad', pending_tool_calls: 'bad' }));
      await expect(readSessionState(statePath)).resolves.toMatchObject({ response_id: 'resp', history: [], pending_tool_calls: [] });
    } finally { cleanupTempDir(tmp); }
  });
  test('reads the shared checkpoint and falls back to the latest successful history entry', async () => {
    const tmp = makeTempDir('agentx-checkpoint-');
    try {
      const checkpoint = `${tmp}/.agentx_checkpoint`;
      const state = `${tmp}/.agentx_responseid`;
      await persistResponseState(state, { history: [{ response_id: 'resp-history', usage: { turns: 2 }, last_user_message: 'u', last_assistant_message: 'a' }] });
      await expect(readLatestCheckpoint(checkpoint, state)).resolves.toMatchObject({ response_id: 'resp-history', pending_tool_calls: [], history: [{ response_id: 'resp-history' }] });
      await persistCheckpoint(checkpoint, { response_id: 'resp-checkpoint', usage: { turns: 3 }, last_user_message: 'u2', last_assistant_message: 'a2' });
      await expect(readLatestCheckpoint(checkpoint, state)).resolves.toMatchObject({ response_id: 'resp-checkpoint', usage: { turns: 3 } });
    } finally { cleanupTempDir(tmp); }
  });

  test('uses the checkpoint directly and returns null when fallback is omitted', async () => {
    const tmp = makeTempDir('agentx-checkpoint-direct-');
    try {
      const checkpoint = `${tmp}/.agentx_checkpoint`;
      await persistResponseState(checkpoint, { response_id: 'resp-direct' });
      await expect(readLatestCheckpoint(checkpoint)).resolves.toMatchObject({ response_id: 'resp-direct' });
      await expect(readLatestCheckpoint(`${tmp}/missing-checkpoint`)).resolves.toBeNull();
    } finally { cleanupTempDir(tmp); }
  });

  test('returns no checkpoint when neither source has a successful response', async () => {
    const tmp = makeTempDir('agentx-checkpoint-empty-');
    try { await expect(readLatestCheckpoint(`${tmp}/missing-checkpoint`, `${tmp}/missing-state`)).resolves.toBeNull(); } finally { cleanupTempDir(tmp); }
  });

});
