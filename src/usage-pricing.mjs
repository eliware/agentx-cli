const MODEL_PRICING = {
  "gpt-6-luna": { input: 100n, cached: 10n, cacheWrite: 125n, output: 500n },
  "gpt-5.6-luna": { input: 200n, cached: 20n, cacheWrite: 250n, output: 1_200n },
  "gpt-5.6-terra": { input: 2_000n, cached: 200n, cacheWrite: 2_500n, output: 12_000n },
  "gpt-5.6-sol": { input: 5_000n, cached: 500n, cacheWrite: 6_250n, output: 30_000n },
};

const DEFAULT_MODEL = "gpt-6-luna";
const JUMBO_PROMPT_THRESHOLD = 272_000;
const ANSI_ESCAPE = new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, "g");

export function getModelPricing(model = DEFAULT_MODEL) {
  return MODEL_PRICING[String(model || "").toLowerCase()] || MODEL_PRICING[DEFAULT_MODEL];
}

export function isJumboPrompt({ inputTokens = 0, cachedTokens = 0 } = {}) {
  const hiddenInputTokens = Math.max(Number(inputTokens ?? 0) - Number(cachedTokens ?? 0), 0);
  return hiddenInputTokens > JUMBO_PROMPT_THRESHOLD;
}

export function ratesForUsage({ inputTokens, cachedTokens, model }) {
  const pricing = getModelPricing(model);
  if (!isJumboPrompt({ inputTokens, cachedTokens })) return pricing;
  return {
    input: pricing.input * 2n,
    cached: pricing.cached * 2n,
    cacheWrite: pricing.cacheWrite * 2n,
    output: (pricing.output * 3n) / 2n,
  };
}

function toTokenCount(value) {
  const parsed = Number(String(value ?? "").replace(ANSI_ESCAPE, ""));
  return BigInt(Math.max(0, Math.trunc(Number.isFinite(parsed) ? parsed : 0)));
}

export function calculateUsageCostNanoDollars({
  inputTokens = 0,
  cachedTokens = 0,
  cacheWriteTokens = 0,
  outputTokens = 0,
  model = DEFAULT_MODEL,
} = {}) {
  const rates = ratesForUsage({ inputTokens, cachedTokens, model });
  return (
    toTokenCount(inputTokens) * rates.input +
    toTokenCount(cachedTokens) * rates.cached +
    toTokenCount(cacheWriteTokens) * rates.cacheWrite +
    toTokenCount(outputTokens) * rates.output
  );
}

export function calculateUsageCost(fields = {}) {
  return Number(calculateUsageCostNanoDollars(fields)) / 1_000_000_000;
}

export const usagePricingInternals = { DEFAULT_MODEL, JUMBO_PROMPT_THRESHOLD, MODEL_PRICING };
