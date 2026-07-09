import { describe, expect, test } from '@jest/globals';
import { clearCredentials, loadStoredCredentials, saveCredentials } from '../src/frontend/credentials.mjs';
import { clearStoredSession, loadStoredSession, normalizeSessionState, saveStoredSession } from '../src/frontend/session-storage.mjs';

class FakeStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}

describe('frontend credentials helpers', () => {
  test('stores, loads, and clears remembered credentials', () => {
    const storage = new FakeStorage();
    const creds = { username: 'root', password: 'secret', remember: true, autologin: true };

    saveCredentials(storage, creds);
    expect(loadStoredCredentials(storage)).toEqual(creds);

    clearCredentials(storage);
    expect(loadStoredCredentials(storage)).toBeNull();
  });

  test('ignores invalid or non-remembered values', () => {
    const storage = new FakeStorage();
    storage.setItem('agentx.gui.credentials', '{');
    expect(loadStoredCredentials(storage)).toBeNull();

    storage.setItem('agentx.gui.credentials', JSON.stringify({ username: 'root' }));
    expect(loadStoredCredentials(storage)).toBeNull();

    storage.setItem('agentx.gui.credentials', JSON.stringify({ username: 'root', password: 'secret', remember: false }));
    expect(loadStoredCredentials(storage)).toEqual({
      username: 'root',
      password: 'secret',
      remember: false,
      autologin: false,
    });

    storage.setItem('agentx.gui.credentials', 'kept');
    saveCredentials(storage, { username: 'root', password: 'secret', remember: false, autologin: true });
    expect(storage.getItem('agentx.gui.credentials')).toBe('kept');
  });

  test('handles missing storage and default arguments', () => {
    expect(loadStoredCredentials()).toBeNull();
    expect(saveCredentials()).toBeUndefined();
    expect(clearCredentials()).toBeUndefined();

    expect(loadStoredCredentials(null)).toBeNull();
    expect(saveCredentials(null, { username: 'root', password: 'secret', remember: true })).toBeUndefined();
    expect(clearCredentials(null)).toBeUndefined();
  });

  test('covers session storage defaults and invalid JSON', () => {
    const storage = new FakeStorage();

    expect(normalizeSessionState()).toEqual({
      response_id: '',
      usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 },
      last_user_message: '',
      last_assistant_message: '',
      pending_cli_transcript: '',
      pending_tool_calls: [],
      cwd: '',
      updated_at: '',
    });

    expect(loadStoredSession()).toBeNull();
    expect(loadStoredSession(null)).toBeNull();

    storage.setItem('agentx.gui.session', '{');
    expect(loadStoredSession(storage)).toBeNull();

    expect(normalizeSessionState({ usage: { inputTokens: 5, cachedTokens: 1, outputTokens: 2, turns: 3 } })).toMatchObject({
      usage: { inputTokens: 5, cachedTokens: 1, outputTokens: 2, turns: 3 },
    });

    saveStoredSession(storage, { response_id: 'resp-1' });
    expect(storage.getItem('agentx.gui.session')).toContain('resp-1');
    clearStoredSession(storage);
    expect(storage.getItem('agentx.gui.session')).toBeNull();

    expect(saveStoredSession()).toBeUndefined();
    expect(clearStoredSession()).toBeUndefined();
    expect(saveStoredSession(null, { response_id: 'x' })).toBeUndefined();
    expect(clearStoredSession(null)).toBeUndefined();
  });
});
