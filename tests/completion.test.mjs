import { describe, expect, test } from '@jest/globals';
import { completePath as completePathWrapper } from '../src/completion.mjs';
import { completePath as completePathDirect } from '../src/path-completion.mjs';

describe('completion wrapper', () => {
  test('re-exports completePath', () => {
    expect(completePathWrapper).toBe(completePathDirect);
  });
});
