import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { path } from '@eliware/common';

const MAX_WORKERS = 3;
const MAX_OUTPUT_LENGTH = 1_000_000;
const WORKER_TIMEOUT_MS = 10 * 60 * 1000;
const workers = new Map();
const workerChildren = new Map();
const SHUTDOWN_GRACE_MS = 2_000;
const DEFAULT_STATUS_TIMEOUT_MS = 15_000;
const MIN_STATUS_TIMEOUT_MS = 10_000;
const MAX_STATUS_TIMEOUT_MS = 180_000;
const entrypoint = path(import.meta, '../agentx.mjs');

function argsFor(call) {
  const raw = call?.arguments ?? call?.input ?? '{}';
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

export function parseWorkerUsage(text) {
  const usage = { turns: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
  const pattern = /\{"in":"([\d,]+) \([^"]*\)","cache":"([\d,]+) \([^"]*\)","out":"([\d,]+) \([^"]*\)","total":"[^"]*"\}/g;
  let match;
  while ((match = pattern.exec(text))) {
    usage.inputTokens += Number(match[1].replaceAll(',', ''));
    usage.cachedTokens += Number(match[2].replaceAll(',', ''));
    usage.outputTokens += Number(match[3].replaceAll(',', ''));
    usage.turns += 1;
  }
  return usage.turns ? usage : null;
}

export function selectWorkerOutput(text, options = {}) {
  const maxBytes = Math.min(Math.max(Number(options.output_bytes) || 2048, 1), 8192);
  const offsetBytes = Math.max(Number(options.output_offset) || 0, 0);
  let output;
  if (options.search !== undefined) {
    try {
      const pattern = new RegExp(options.search, 'i');
      output = text.split(/\r?\n/).filter(Boolean).filter((line) => pattern.test(line)).join('\n');
    } catch {
      output = '';
    }
  } else {
    const bytes = Buffer.from(text);
    const end = Math.max(0, bytes.length - offsetBytes);
    output = bytes.subarray(Math.max(0, end - maxBytes), end).toString();
  }
  return Buffer.from(output).subarray(0, maxBytes).toString();
}

function snapshot(worker, options = {}) {
  return { id: worker.id, task: worker.task, status: worker.status, elapsed_ms: (worker.finishedAt || Date.now()) - worker.startedAt, lines: worker.lines, output: selectWorkerOutput(worker.output, options), usage: worker.usage, ...(worker.error ? { error: worker.error } : {}) };
}

function startWorker(task, cwd, permissions, debug = false, onUsage) {
  const worker = { id: `agent-${randomUUID()}`, task, status: 'running', startedAt: Date.now(), lines: 0, output: '', usage: null, usageReported: false, exited: false, killTimer: null };
  workers.set(worker.id, worker);
  const child = spawn(process.execPath, [entrypoint, ...(debug ? ['--debug'] : []), task], { cwd, env: { ...process.env, AGENTX_WORKER_ID: worker.id, AGENTX_PERMISSION: permissions }, stdio: ['ignore', 'pipe', 'pipe'] });
  workerChildren.set(worker.id, child);
  const append = (chunk) => {
    const text = String(chunk);
    worker.output = `${worker.output}${text}`.slice(-MAX_OUTPUT_LENGTH);
    worker.lines += text.split(/\r?\n/).filter(Boolean).length;
    worker.usage = parseWorkerUsage(worker.output) || worker.usage;
  };
  worker.timeout = setTimeout(() => {
    worker.status = 'timed_out';
    worker.error = `worker exceeded ${WORKER_TIMEOUT_MS}ms`;
    child.kill('SIGTERM');
    worker.killTimer = setTimeout(() => { if (!worker.exited) child.kill('SIGKILL'); }, SHUTDOWN_GRACE_MS);
  }, WORKER_TIMEOUT_MS);
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', (error) => { worker.exited = true; clearTimeout(worker.timeout); clearTimeout(worker.killTimer); worker.status = 'failed'; worker.error = error.message; worker.finishedAt = Date.now(); });
  child.on('close', (code, signal) => { worker.exited = true; clearTimeout(worker.timeout); clearTimeout(worker.killTimer); workerChildren.delete(worker.id); worker.status = worker.status === 'timed_out' ? 'timed_out' : (worker.status === 'cancelled' ? 'cancelled' : (code === 0 ? 'completed' : 'failed')); worker.exitCode = code; if (worker.status === 'completed' && worker.usage && !worker.usageReported) { worker.usageReported = true; onUsage?.(worker.usage); } worker.signal = signal; worker.finishedAt = Date.now(); });
  return worker;
}


export async function terminateWorkers() {
  const active = [...workerChildren.entries()];
  for (const [id, child] of active) {
    const worker = workers.get(id);
    if (worker?.status === 'running') {
      worker.status = 'terminated';
      worker.error = 'parent process shut down';
      worker.finishedAt = Date.now();
    }
    child.kill('SIGTERM');
  }
  if (!active.length) return;
  await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS));
  for (const [id, child] of active) {
    const worker = workers.get(id);
    if (worker && !worker.exited) child.kill('SIGKILL');
  }
}

process.once('beforeExit', () => {
  if (workerChildren.size) void terminateWorkers();
});

export async function runParallelWorkerFunction(call, cwd, options = {}) {
  if (!call || typeof call !== 'object' || Array.isArray(call)) return { error: 'invalid worker function call' };
  if (typeof cwd !== 'string' || !cwd.trim()) return { error: 'invalid working directory' };
  const args = argsFor(call);
  if (call?.name === 'spawn_agent') {
    if (process.env.AGENTX_WORKER_ID) return { error: 'nested worker spawning is disabled' };
    const permissions = ['read', 'write', 'execute'].includes(args.permissions) ? args.permissions : 'execute';
    const debug = args.debug === true;
    const wait = args.wait === true;
    const requestedTimeout = args.timeout_ms === undefined ? DEFAULT_STATUS_TIMEOUT_MS : Number(args.timeout_ms);
    const timeout = Number.isFinite(requestedTimeout)
      ? Math.min(Math.max(requestedTimeout, MIN_STATUS_TIMEOUT_MS), MAX_STATUS_TIMEOUT_MS)
      : DEFAULT_STATUS_TIMEOUT_MS;
    const tasks = Array.isArray(args.tasks) ? args.tasks.filter((task) => typeof task === 'string' && task.trim()).slice(0, MAX_WORKERS) : [];
    if (!tasks.length) return { error: 'tasks must contain 1-3 non-empty strings' };
    const started = tasks.map((task) => { const worker = startWorker(task, cwd, permissions, debug, options.onWorkerUsage); return { id: worker.id, task, permissions, debug, status: worker.status }; });
    if (!wait) return { agents: started, waited: false, timed_out: false };
    const deadline = Date.now() + timeout;
    let agents = started.map((agent) => ({ ...agent, ...snapshot(workers.get(agent.id), args) }));
    const done = (items) => items.every((item) => ['completed', 'failed', 'timed_out', 'terminated', 'cancelled', 'unknown'].includes(item.status));
    while (!done(agents) && Date.now() < deadline) { await new Promise((resolve) => setTimeout(resolve, 100)); agents = started.map((agent) => ({ ...agent, ...snapshot(workers.get(agent.id), args) })); }
    return { agents, waited: true, timed_out: !done(agents) };
  }
  if (call?.name === 'cancel_agent') {
    const ids = Array.isArray(args.agent_ids) ? args.agent_ids.filter((id) => typeof id === 'string' && id.trim()).slice(0, MAX_WORKERS) : [];
    const agents = [];
    for (const id of ids) {
      const worker = workers.get(id);
      const child = workerChildren.get(id);
      if (!worker) { agents.push({ id, status: 'unknown' }); continue; }
      if (!child || !['running', 'timed_out'].includes(worker.status)) { agents.push(snapshot(worker)); continue; }
      worker.status = 'cancelled';
      worker.error = 'cancelled by request';
      worker.finishedAt = Date.now();
      child.kill('SIGTERM');
      worker.killTimer = setTimeout(() => { if (!worker.exited) child.kill('SIGKILL'); }, SHUTDOWN_GRACE_MS);
      agents.push(snapshot(worker));
    }
    return { agents };
  }
  if (call?.name === 'agent_status') {
    const ids = Array.isArray(args.agent_ids) ? args.agent_ids.filter((id) => typeof id === 'string' && id.trim()).slice(0, MAX_WORKERS) : [];
    const wait = args.wait === true;
    const requestedTimeout = args.timeout_ms === undefined ? DEFAULT_STATUS_TIMEOUT_MS : Number(args.timeout_ms);
    const timeout = Number.isFinite(requestedTimeout)
      ? Math.min(Math.max(requestedTimeout, MIN_STATUS_TIMEOUT_MS), MAX_STATUS_TIMEOUT_MS)
      : DEFAULT_STATUS_TIMEOUT_MS;
    const deadline = wait ? Date.now() + timeout : 0;
    const read = () => ids.map((id) => workers.has(id) ? snapshot(workers.get(id), args) : { id, status: 'unknown' });
    const done = (items) => items.every((item) => ['completed', 'failed', 'timed_out', 'terminated', 'cancelled', 'unknown'].includes(item.status));
    let agents = read();
    while (wait && !done(agents) && (!deadline || Date.now() < deadline)) { await new Promise((resolve) => setTimeout(resolve, 100)); agents = read(); }
    return { agents, waited: wait, timed_out: wait && !done(agents) };
  }
  return { error: `unsupported worker function ${call?.name || ''}` };
}
