import { afterEach, describe, expect, test } from '@jest/globals';
import { clearAuthTokens, consumeAuthToken, countAuthTokens, issueAuthToken, parseBearerToken, peekAuthToken } from '../src/backend/auth-tokens.mjs';

afterEach(() => {
  clearAuthTokens();
});

describe('backend auth tokens', () => {
  test('issues one-time tokens and consumes them once', () => {
    const issued = issueAuthToken('root', 30_000);
    expect(issued.username).toBe('root');
    expect(typeof issued.token).toBe('string');
    expect(peekAuthToken(issued.token)).toMatchObject({ username: 'root' });
    expect(countAuthTokens()).toBe(1);

    const consumed = consumeAuthToken(issued.token);
    expect(consumed).toMatchObject({ token: issued.token, username: 'root' });
    expect(consumeAuthToken(issued.token)).toBeNull();
    expect(peekAuthToken(issued.token)).toBeNull();
    expect(countAuthTokens()).toBe(0);
  });

  test('drops expired tokens and parses bearer headers', () => {
    const issued = issueAuthToken('alice', -1);
    expect(consumeAuthToken(issued.token)).toBeNull();
    expect(countAuthTokens()).toBe(0);
    expect(parseBearerToken('Bearer abc123')).toBe('abc123');
    expect(parseBearerToken(['Bearer xyz'])).toBe('xyz');
    expect(parseBearerToken('Basic nope')).toBeNull();
    expect(parseBearerToken(null)).toBeNull();
  });
});
