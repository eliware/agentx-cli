import { describe, expect, test } from '@jest/globals';
import { clearCredentials, loadStoredCredentials, saveCredentials } from '../src/frontend/credentials.mjs';

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

    storage.setItem('agentx.gui.credentials', 'kept');
    saveCredentials(storage, { username: 'root', password: 'secret', remember: false, autologin: true });
    expect(storage.getItem('agentx.gui.credentials')).toBe('kept');
  });
});
