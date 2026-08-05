import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MAX_WORKERS = 3;
const MAX_OUTPUT_LENGTH = 1_000_000;
const WORKER_TIMEOUT_MS = 10 * 60 * 1000;
const workers = new Map();
const workerChildren = new Map();
const SHUTDOWN_GRACE_MS = 2_000;
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

function startWorker(task, cwd, permissions, debug = false) {
  const worker = { id: `agent-${randomUUID()}`, task, status: 'running', startedAt: Date.now(), lines: 0, output: '', usage: null, exited: false, killTimer: null };
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
  child.on('close', (code, signal) => { worker.exited = true; clearTimeout(worker.timeout); clearTimeout(worker.killTimer); workerChildren.delete(worker.id); worker.status = worker.status === 'timed_out' ? 'timed_out' : (worker.status === 'cancelled' ? 'cancelled' : (code === 0 ? 'completed' : 'failed')); worker.exitCode = code; worker.signal = signal; worker.finishedAt = Date.now(); });
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

process.once('exit', () => {
  for (const child of workerChildren.values()) child.kill('SIGKILL');
});

export async function runParallelWorkerFunction(call, cwd) {
  const args = argsFor(call);
  if (call?.name === 'spawn_agent') {
    if (process.env.AGENTX_WORKER_ID) return { error: 'nested worker spawning is disabled' };
    const permissions = ['read', 'write', 'execute'].includes(args.permissions) ? args.permissions : 'execute';
    const debug = args.debug === true;
    const tasks = Array.isArray(args.tasks) ? args.tasks.filter((task) => typeof task === 'string' && task.trim()).slice(0, MAX_WORKERS) : [];
    if (!tasks.length) return { error: 'tasks must contain 1-3 non-empty strings' };
    return { agents: tasks.map((task) => { const worker = startWorker(task, cwd, permissions, debug); return { id: worker.id, task, permissions, debug, status: worker.status }; }) };
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
    const timeout = Number(args.timeout_ms);
    const deadline = Number.isFinite(timeout) && timeout > 0 ? Date.now() + timeout : 0;
    const read = () => ids.map((id) => workers.has(id) ? snapshot(workers.get(id)) : { id, status: 'unknown' });
    const done = (items) => items.every((item) => ['completed', 'failed', 'timed_out', 'terminated', 'cancelled', 'unknown'].includes(item.status));
    let agents = read();
    while (wait && !done(agents) && (!deadline || Date.now() < deadline)) { await new Promise((resolve) => setTimeout(resolve, 100)); agents = read(); }
    return { agents, waited: wait, timed_out: wait && !done(agents) };
  }
  return { error: `unsupported worker function ${call?.name || ''}` };
}
