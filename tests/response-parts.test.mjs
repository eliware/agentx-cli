import { describe, expect, test } from '@jest/globals';
import { addTurn, addUsageTotals, createUsageTotals, extractTextFromResponse, extractUsage, isFunctionCall } from '../src/response-parts.mjs';

describe('response parts', () => {
  test('extracts message text and usage details', () => {
    expect(extractTextFromResponse()).toBe('');
    expect(extractTextFromResponse({ output: [{ type: 'reasoning' }, { type: 'message' }] })).toBe('');
    expect(extractTextFromResponse({ output: [{ type: 'message', content: [{ type: 'other' }] }] })).toBe('');
    expect(extractTextFromResponse({ output: [{ type: 'message' }] })).toBe('');
    expect(extractTextFromResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'one' }, { type: 'output_text', text: 'two' }] }] })).toBe('one\ntwo');
    expect(isFunctionCall({ type: 'function_call' })).toBe(true);
    expect(isFunctionCall({ type: 'message' })).toBe(false);
    expect(extractUsage()).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
    expect(extractUsage({ usage: { input_tokens: 17, input_tokens_details: { cached_tokens: 5 }, output_tokens: 9 } })).toEqual({ inputTokens: 12, cachedTokens: 5, outputTokens: 9 });
  });

  test('accumulates usage totals and turns', () => {
    const totals = createUsageTotals();
    addUsageTotals(totals, { inputTokens: 1, cachedTokens: 2, outputTokens: 3 });
    addUsageTotals(totals, { inputTokens: 4, cachedTokens: 5, outputTokens: 6 });
    addTurn(totals);
    addTurn(totals);
    expect(totals).toEqual({ inputTokens: 5, cachedTokens: 7, outputTokens: 9, turns: 2 });
    expect(addUsageTotals(createUsageTotals(), undefined)).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 });
    expect(addTurn(createUsageTotals())).toEqual({ inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 1 });
  });
});
