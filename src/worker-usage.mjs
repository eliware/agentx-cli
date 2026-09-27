import { stripAnsi } from "./usage-normalization.mjs";

export function parseWorkerUsage(text) {
  const reports = String(text)
    .split(/\r?\n/)
    .map((line) => {
      try {
        return JSON.parse(stripAnsi(line));
      } catch {
        return null;
      }
    })
    .filter(
      (report) =>
        report &&
        typeof report === "object" &&
        typeof report.in === "string" &&
        typeof report.cache === "string" &&
        typeof report.out === "string",
    );
  if (!reports.length) return null;
  const reportsToSum = reports.filter(
    (report) =>
      !Object.prototype.hasOwnProperty.call(report, "turns") &&
      !Object.prototype.hasOwnProperty.call(report, "avg"),
  );
  const usage = {
    turns: 0,
    inputTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  };
  for (const report of reportsToSum) {
    const parseTokens = (value) => Number(String(value).split(" ")[0].replaceAll(",", ""));
    usage.inputTokens += parseTokens(report.in);
    usage.cachedTokens += parseTokens(report.cache);
    if (report.write) usage.cacheWriteTokens += parseTokens(report.write);
    usage.outputTokens += parseTokens(report.out);
    if (report.reasoning) usage.reasoningTokens += parseTokens(report.reasoning);
    usage.turns += 1;
  }
  if (!usage.cacheWriteTokens) delete usage.cacheWriteTokens;
  if (!usage.reasoningTokens) delete usage.reasoningTokens;
  return usage.turns ? usage : null;
}

export function reportWorkerUsage(worker, onUsage) {
  if (!worker?.usage || worker.usageReported) return false;
  worker.usageReported = true;
  onUsage?.(worker.usage, worker);
  return true;
}
