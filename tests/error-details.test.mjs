import { describe, expect, test } from '@jest/globals';
import { describeOpenAIError, formatOpenAIError } from '../src/error-details.mjs';

describe('OpenAI error details', () => {
  test('formats bounded actionable metadata', () => {
    const error = Object.assign(new Error('server said no'), {
      code: 'rate_limit', status: 429, param: 'model', request_id: 'req-1',
      cause: new Error('socket reset'),
    });
    expect(describeOpenAIError(error)).toEqual([
      'code=rate_limit', 'status=429', 'param=model', 'request_id=req-1', 'cause=socket reset',
    ]);
    expect(formatOpenAIError(error)).toContain('server said no [');
  });

  test('omits absent metadata and falls back safely', () => {
    expect(describeOpenAIError({ message: 'x' })).toEqual([]);
    expect(formatOpenAIError({ message: 'x' })).toBe('x');
  });
});
