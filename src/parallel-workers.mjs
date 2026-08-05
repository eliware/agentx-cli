import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MAX_WORKERS = 10;
const workers = new Map();
const entrypoint = join(dirname(fileURLToPath(import.meta.url)), '..', 'agentx.mjs');

function argsFor(call) {
  const raw = call?.arguments ?? call?.input ?? '{}';
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

export function parseWorkerUsage(text) {
  const match = text.match(/\{"in":"(\d+)[^"]*","cache":"(\d+)[^"]*","out":"(\d+)[^"]*","turns":"(\d+)/);
  return match ? { turns: +match[4], inputTokens: +match[1], cachedTokens: +match[2], outputTokens: +match[3] } : null;
}

function snapshot(worker) {
  return { id: worker.id, task: worker.task, status: worker.status, elapsed_ms: (worker.finishedAt || Date.now()) - worker.startedAt, lines: worker.lines, output: worker.output.slice(-10000), usage: worker.usage, ...(worker.error ? { error: worker.error } : {}) };
}

function startWorker(task, cwd) {
  const worker = { id: `agent-${randomUUID()}`, task, status: 'running', startedAt: Date.now(), lines: 0, output: '', usage: null };
  workers.set(worker.id, worker);
  const child = spawn(process.execPath, [entrypoint, '--yolo', task], { cwd, env: { ...process.env, AGENTX_WORKER_ID: worker.id }, stdio: ['ignore', 'pipe', 'pipe'] });
  const append = (chunk) => { const text = String(chunk); worker.output += text; worker.lines += text.split(/\r?\n/).filter(Boolean).length; worker.usage = parseWorkerUsage(worker.output) || worker.usage; };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', (error) => { worker.status = 'failed'; worker.error = error.message; worker.finishedAt = Date.now(); });
  child.on('close', (code, signal) => { worker.status = code === 0 ? 'completed' : 'failed'; worker.exitCode = code; worker.signal = signal; worker.finishedAt = Date.now(); });
  return worker;
}

export async function runParallelWorkerFunction(call, cwd) {
  const args = argsFor(call);
  if (call?.name === 'spawn_agent') {
    const tasks = Array.isArray(args.tasks) ? args.tasks.filter((task) => typeof task === 'string' && task.trim()).slice(0, MAX_WORKERS) : [];
    if (!tasks.length) return { error: 'tasks must contain 1-10 non-empty strings' };
    return { agents: tasks.map((task) => { const worker = startWorker(task, cwd); return { id: worker.id, task, status: worker.status }; }) };
  }
  if (call?.name === 'agent_status') {
    const ids = Array.isArray(args.agent_ids) ? args.agent_ids.filter((id) => typeof id === 'string' && id.trim()).slice(0, MAX_WORKERS) : [];
    const wait = args.wait === true;
    const timeout = Number(args.timeout_ms);
    const deadline = Number.isFinite(timeout) && timeout > 0 ? Date.now() + timeout : 0;
    const read = () => ids.map((id) => workers.has(id) ? snapshot(workers.get(id)) : { id, status: 'unknown' });
    const done = (items) => items.every((item) => ['completed', 'failed', 'unknown'].includes(item.status));
    let agents = read();
    while (wait && !done(agents) && (!deadline || Date.now() < deadline)) { await new Promise((resolve) => setTimeout(resolve, 100)); agents = read(); }
    return { agents, waited: wait, timed_out: wait && !done(agents) };
  }
  return { error: `unsupported worker function ${call?.name || ''}` };
}
