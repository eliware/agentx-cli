import { describe, expect, test } from '@jest/globals';
import { extractTextFromResponse, extractUsage, isFunctionCall, formatUsageSummary, createUsageTotals, addUsageTotals, addTurn, formatUsageReport, formatTurnUsageReport } from '../src/response.mjs';

const sampleUsage = { input_tokens: 5, input_tokens_details: { cached_tokens: 2 }, output_tokens: 3 };

describe('response helpers', () => {
  test('extractTextFromResponse joins assistant text output', () => {
    const response = {
      output: [
        {
          type: 'message',
          content: [
            { type: 'output_text', text: 'one' },
            { type: 'output_text', text: 'two' },
          ],
        },
      ],
    };

    expect(extractTextFromResponse(response)).toBe('one\ntwo');
  });

  test('isFunctionCall detects function tool calls', () => {
    expect(isFunctionCall({ type: 'function_call' })).toBe(true);
    expect(isFunctionCall({ type: 'message' })).toBe(false);
  });

  test('extractUsage subtracts cached tokens from input tokens', () => {
    expect(extractUsage({ usage: { input_tokens: 120, input_tokens_details: { cached_tokens: 45 }, output_tokens: 80 } })).toEqual({ inputTokens: 75, cachedTokens: 45, outputTokens: 80 });
  });

  test('usage totals accumulate', () => {
    const totals = createUsageTotals();
    addUsageTotals(totals, { inputTokens: 1, cachedTokens: 2, outputTokens: 3 });
    addUsageTotals(totals, { inputTokens: 4, cachedTokens: 5, outputTokens: 6 });
    addTurn(totals);
    addTurn(totals);
    expect(totals).toEqual({ inputTokens: 5, cachedTokens: 7, outputTokens: 9, turns: 2 });
  });

  test('format helpers render usage stats', () => {
    expect(formatUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3, turns: 4 })).toBe('in=1 ($0.000), cache=2 ($0.000), out=3 ($0.000), sum=$0.000, msgs=4, avg=$0.000');
    expect(formatTurnUsageReport({ inputTokens: 1, cachedTokens: 2, outputTokens: 3 })).toBe('in=1 ($0.000), cache=2 ($0.000), out=3 ($0.000), sum=$0.000');
    expect(formatUsageSummary({ usage: sampleUsage })).toBe('in=3 ($0.000), cache=2 ($0.000), out=3 ($0.000), sum=$0.000, msgs=1, avg=$0.000');
  });
});
