import { normalizeUsage } from './usage.mjs';

export function extractTextFromResponse(response) {
  const parts = [];
  for (const item of response?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content?.type === 'output_text' && content.text) parts.push(content.text);
    }
  }
  return parts.join('\n');
}

export function isFunctionCall(item) {
  return item?.type === 'function_call';
}

export function extractUsage(response) {
  const usage = response?.usage ?? {};
  return normalizeUsage({
    inputTokens: Number(usage.input_tokens ?? 0),
    cachedTokens: Number(usage.input_tokens_details?.cached_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
  });
}

export function createUsageTotals() {
  return { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 };
}

export function addUsageTotals(totals, usage) {
  totals.inputTokens += Number(usage?.inputTokens ?? 0);
  totals.cachedTokens += Number(usage?.cachedTokens ?? 0);
  totals.outputTokens += Number(usage?.outputTokens ?? 0);
  return totals;
}

export function addTurn(totals) {
  totals.turns += 1;
  return totals;
}
