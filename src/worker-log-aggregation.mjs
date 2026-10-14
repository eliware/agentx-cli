import { parseWorkerUsage } from "./worker-usage.mjs";

export function aggregateWorkerOutput(worker, value) {
  const text = String(value);
  worker.output = `${worker.output}${text}`.slice(-10 * 1024 * 1024);
  worker.lines += text.split(/\r?\n/).filter(Boolean).length;
  worker.usage = parseWorkerUsage(worker.output) || worker.usage;
}
