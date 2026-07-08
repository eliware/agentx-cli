import { describe, expect, test } from '@jest/globals';
import { buildWebSocketUrl } from '../src/frontend/websocket.mjs';

describe('frontend websocket helper', () => {
  test('builds ws and wss urls', () => {
    expect(buildWebSocketUrl({ location: { protocol: 'http:', host: 'example.test' } }, 'token 1')).toBe('ws://example.test/ws?token=token%201');
    expect(buildWebSocketUrl({ location: { protocol: 'https:', host: 'example.test' } }, 'token-2')).toBe('wss://example.test/ws?token=token-2');
  });
});
