import { numericValue } from "./usage-normalization.mjs";

const NANO_DOLLARS_PER_DISPLAY_UNIT = 1_000_000n;

export function formatMoney(value) {
  const nanoDollars =
    typeof value === "bigint" ? value : BigInt(Math.trunc(Number(value ?? 0) * 1_000_000_000));
  const roundedThousandths =
    nanoDollars >= 0n
      ? (nanoDollars + NANO_DOLLARS_PER_DISPLAY_UNIT / 2n) / NANO_DOLLARS_PER_DISPLAY_UNIT
      : -((-nanoDollars + NANO_DOLLARS_PER_DISPLAY_UNIT / 2n) / NANO_DOLLARS_PER_DISPLAY_UNIT);
  const sign = roundedThousandths < 0n ? "-" : "";
  const absolute = roundedThousandths < 0n ? -roundedThousandths : roundedThousandths;
  const whole = absolute / 1000n;
  const fractional = (absolute % 1000n).toString().padStart(3, "0");
  return `$${sign}${whole.toString()}.${fractional}`;
}

export function formatTokenCount(tokens) {
  return numericValue(tokens).toLocaleString("en-US");
}

export function formatTokenCost(tokens, rateNanoDollarsPerToken) {
  const count = BigInt(Math.trunc(numericValue(tokens)));
  return `${formatTokenCount(tokens)} (${formatMoney(count * rateNanoDollarsPerToken)})`;
}

export function formatUsageJson(fields) {
  return JSON.stringify(fields).replaceAll("\\u001b", "\u001b");
}
