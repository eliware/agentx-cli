import { describe, expect, test } from '@jest/globals';
import { existsSync } from 'node:fs';
import { clearSession, persistResponseState, readSessionState } from '../src/session-state.mjs';
import { cleanupTempDir, makeTempDir, makeFile } from './test-helpers.mjs';

describe('session state', () => {
  test('persists, reads and clears state files', async () => {
    const tmp = makeTempDir('agentx-state-');
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await persistResponseState(statePath, { response_id: 'resp-1', usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 }, last_user_message: 'hello', last_assistant_message: 'hi', pending_cli_transcript: '', pending_tool_calls: [{ type: 'function_call', name: 'shell_call', call_id: 'call-1', arguments: '{"p":[{"s":["echo hi"]}]}' }], pending_response_usage: { inputTokens: 7, cachedTokens: 1, outputTokens: 2 } });
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: 'resp-1', usage: { inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 }, last_user_message: 'hello', last_assistant_message: 'hi', pending_cli_transcript: '', pending_tool_calls: [{ type: 'function_call', name: 'shell_call', call_id: 'call-1', arguments: '{"p":[{"s":["echo hi"]}]}' }], pending_response_usage: { inputTokens: 7, cachedTokens: 1, outputTokens: 2, turns: 0 } });

      await makeFile(tmp, '.agentx_responseid', 'resp-legacy\n');
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: 'resp-legacy', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [], pending_response_usage: null });

      await makeFile(tmp, '.agentx_responseid', '');
      await expect(readSessionState(statePath)).resolves.toBeNull();

      await clearSession(statePath);
      expect(existsSync(statePath)).toBe(false);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('persists empty values when no state is supplied', async () => {
    const tmp = makeTempDir('agentx-state-');
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await persistResponseState(statePath, undefined);
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: '', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [], pending_response_usage: null });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('falls back from primitive JSON values', async () => {
    const tmp = makeTempDir('agentx-state-');
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await makeFile(tmp, '.agentx_responseid', '42');
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: '42', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [], pending_response_usage: null });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  test('normalizes JSON, legacy text and malformed content', async () => {
    const tmp = makeTempDir('agentx-state-');
    const statePath = `${tmp}/.agentx_responseid`;
    try {
      await makeFile(tmp, '.agentx_responseid', '{"response_id":"42"}\n');
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: '42', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [], pending_response_usage: null });

      await makeFile(tmp, '.agentx_responseid', 'not-json');
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: 'not-json', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [], pending_response_usage: null });

      await makeFile(tmp, '.agentx_responseid', '   ');
      await expect(readSessionState(statePath)).resolves.toEqual({ response_id: '', usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 }, last_user_message: '', last_assistant_message: '', pending_cli_transcript: '', pending_tool_calls: [], pending_response_usage: null });
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
