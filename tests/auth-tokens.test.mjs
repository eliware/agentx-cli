import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { AUTH_TOKEN_TTL_MS, clearAuthTokens, consumeAuthToken, countAuthTokens, issueAuthToken, parseBearerToken, peekAuthToken } from '../src/backend/auth-tokens.mjs';

afterEach(() => {
  jest.restoreAllMocks();
  clearAuthTokens();
});

describe('backend auth tokens', () => {
  test('issues one-time tokens and consumes them once', () => {
    const issued = issueAuthToken('root');
    expect(issued.username).toBe('root');
    expect(issued.ttlMs).toBe(AUTH_TOKEN_TTL_MS);
    expect(typeof issued.token).toBe('string');
    expect(peekAuthToken(issued.token)).toMatchObject({ username: 'root' });
    expect(countAuthTokens()).toBe(1);

    const consumed = consumeAuthToken(issued.token);
    expect(consumed).toMatchObject({ token: issued.token, username: 'root' });
    expect(consumeAuthToken(issued.token)).toBeNull();
    expect(peekAuthToken(issued.token)).toBeNull();
    expect(countAuthTokens()).toBe(0);
  });

  test('drops expired tokens, handles empty inputs, and parses bearer headers', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy
      .mockImplementationOnce(() => 1_000)
      .mockImplementationOnce(() => 1_000)
      .mockImplementationOnce(() => 1_000)
      .mockImplementationOnce(() => 2_001)
      .mockImplementationOnce(() => 2_001)
      .mockImplementationOnce(() => 2_001);

    const issued = issueAuthToken('alice', 1_000);
    expect(consumeAuthToken(null)).toBeNull();
    expect(peekAuthToken(null)).toBeNull();
    expect(consumeAuthToken(issued.token)).toBeNull();
    expect(peekAuthToken(issued.token)).toBeNull();
    const expired = issueAuthToken('bob', -1);
    expect(countAuthTokens()).toBe(0);
    expect(expired.token).toBeTruthy();
    expect(parseBearerToken('Bearer abc123')).toBe('abc123');
    expect(parseBearerToken(['Bearer xyz'])).toBe('xyz');
    expect(parseBearerToken('Bearer   ')).toBeNull();
    expect(parseBearerToken('Basic nope')).toBeNull();
    expect(parseBearerToken(null)).toBeNull();
    nowSpy.mockRestore();
  });
});
