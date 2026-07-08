import { describe, expect, test } from '@jest/globals';
import { makeStatusText } from '../src/frontend/status.mjs';

describe('frontend status helper', () => {
  test('formats the main connection states', () => {
    expect(makeStatusText({ loggedOut: true })).toBe('signed out');
    expect(makeStatusText({ authenticated: true, socketState: 'connected' })).toBe('connected');
    expect(makeStatusText({ authenticated: true, socketState: 'connecting' })).toBe('connecting websocket');
    expect(makeStatusText({ authenticated: true, socketState: 'reconnecting' })).toBe('reconnecting');
    expect(makeStatusText({ authenticated: true, socketState: 'disconnected' })).toBe('authenticated');
    expect(makeStatusText({ authenticated: false })).toBe('signed out');
  });
});
