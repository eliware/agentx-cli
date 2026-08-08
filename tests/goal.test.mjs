import { describe, expect, jest, test } from '@jest/globals';
import { parseInternalCommand } from '../src/shell-commands.mjs';
import { handleToolCalls } from '../src/agent-session/tool-loop.mjs';
import { runToolCall } from '../src/tool-dispatch.mjs';
import { persistResponseState, readSessionState } from '../src/session-state.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseRequest = { model: 'test-model', tools: [] };
const goalCall = (name, args, callId = `${name}-1`) => ({
  type: 'function_call',
  name,
  call_id: callId,
  arguments: JSON.stringify(args),
});

function openaiWithResponses(...responses) {
  const requests = [];
  return {
    requests,
    client: { responses: { create: jest.fn(async (request) => { requests.push(request); return responses.shift(); }) } },
  };
}

describe('goal mode', () => {
  test('goal tools preserve argument payloads when dispatched', async () => {
    await expect(runToolCall({ type: 'function_call', name: 'goal_update', arguments: JSON.stringify({ method: 'complete', summary: 'done' }) }, '/tmp')).resolves.toBe(JSON.stringify({ method: 'complete', summary: 'done' }));
    await expect(runToolCall({ type: 'function_call', name: 'goal_update', input: JSON.stringify({ method: 'incomplete' }) }, '/tmp')).resolves.toBe(JSON.stringify({ method: 'incomplete' }));
    await expect(runToolCall({ type: 'function_call', name: 'goal_update' }, '/tmp')).resolves.toBe('{}');
  });

  test('normalizes null persisted goal and malformed goal arguments', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agentx-goal-'));
    try {
      const statePath = join(dir, 'state.json');
      await persistResponseState(statePath, { response_id: 'r1', goal: null });
      await expect(readSessionState(statePath)).resolves.toMatchObject({ response_id: 'r1', goal: null });
      const { client } = openaiWithResponses({ id: 'r2', output: [] });
      const blocked = { type: 'function_call', name: 'goal_update', call_id: 'blocked-invalid', arguments: JSON.stringify({ method: 'question', question: 'Need input' }) };
      const onGoalBlocked = jest.fn();
      await handleToolCalls(client, { id: 'r1', output: [blocked] }, baseRequest, '/tmp', null, undefined, { goalMode: true, goalMaxIterations: 0, onGoalBlocked });
      expect(onGoalBlocked).toHaveBeenCalledWith({ method: 'question', question: 'Need input' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  let originalWrite;

  beforeEach(() => {
    originalWrite = process.stdout.write;
    process.stdout.write = () => true;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  test('parses goal lifecycle commands', () => {
    expect(parseInternalCommand('/goal fix all tests')).toEqual({ type: 'goal', goal: 'fix all tests' });
    expect(parseInternalCommand('/goal status')).toEqual({ type: 'goal_status' });
    expect(parseInternalCommand('/goal cancel')).toEqual({ type: 'goal_cancel' });
    expect(parseInternalCommand('/goal')).toEqual({ type: 'goal_help' });
    expect(parseInternalCommand('  /goal   fix tests  ')).toEqual({ type: 'goal', goal: 'fix tests' });
  });

  test('filters goal tools outside goal mode', async () => {
    const { client, requests } = openaiWithResponses({ id: 'resp-next', output: [] });
    const runToolCall = jest.fn();
    const response = { id: 'resp-1', output: [goalCall('goal_update', { method: 'complete', summary: 'done', evidence: 'tests' })] };

    await expect(handleToolCalls(client, response, baseRequest, '/tmp', null, runToolCall)).resolves.toBe(response);
    expect(runToolCall).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });

  test('parses input and empty goal tool payloads', async () => {
    const { client } = openaiWithResponses({ id: 'resp-input-next', output: [] }, { id: 'resp-empty-next', output: [{ type: 'function_call', name: 'goal_update', call_id: 'empty-next', arguments: JSON.stringify({ method: 'complete' }) }] });
    const onGoalComplete = jest.fn();
    await handleToolCalls(client, { id: 'resp-input', output: [{ type: 'function_call', name: 'goal_update', call_id: 'input-1', input: JSON.stringify({ method: 'complete', summary: 'input' }) }] }, baseRequest, '/tmp', null, undefined, { goalMode: true, onGoalComplete });
    await handleToolCalls(client, { id: 'resp-empty', output: [{ type: 'function_call', name: 'goal_update', call_id: 'empty-1' }] }, baseRequest, '/tmp', null, undefined, { goalMode: true, onGoalComplete });
    expect(onGoalComplete).toHaveBeenNthCalledWith(1, { method: 'complete', summary: 'input' });
    expect(onGoalComplete).toHaveBeenNthCalledWith(2, { method: 'complete' });
  });

  test('executes goal_update and invokes completion callback', async () => {
    const { client, requests } = openaiWithResponses({ id: 'resp-next', output: [] });
    const onGoalComplete = jest.fn();
    const response = { id: 'resp-1', output: [goalCall('goal_update', { method: 'complete', summary: 'done', evidence: 'npm test passes' })] };

    const result = await handleToolCalls(client, response, baseRequest, '/tmp', null, undefined, {
      goalMode: true,
      onGoalComplete,
    });

    expect(result).toEqual({ id: 'resp-next', output: [] });
    expect(onGoalComplete).toHaveBeenCalledWith({ method: 'complete', summary: 'done', evidence: 'npm test passes' });
    expect(requests).toHaveLength(1);
    expect(requests[0].input[0]).toMatchObject({ type: 'function_call_output', call_id: 'goal_update-1', output: 'Goal complete acknowledged.' });
    expect(requests[0].tool_choice).toBe('none');
  });

  test('blocks for an answer and resumes with the answer', async () => {
    const { client, requests } = openaiWithResponses(
      { id: 'resp-blocked-next', output: [] },
      { id: 'resp-blocked-final', output: [{ type: 'function_call', name: 'goal_update', call_id: 'goal-complete-2', arguments: JSON.stringify({ method: 'complete', summary: 'done', evidence: 'answer accepted' }) }] },
      { id: 'resp-blocked-complete', output: [] },
    );
    const onGoalBlocked = jest.fn(async ({ question, choices }) => {
      expect(question).toBe('Which approach?');
      expect(choices).toEqual(['A', 'B']);
      return 'A';
    });
    const response = { id: 'resp-1', output: [goalCall('goal_update', { method: 'question', question: 'Which approach?', choices: ['A', 'B'] })] };

    await handleToolCalls(client, response, baseRequest, '/tmp', null, undefined, { goalMode: true, onGoalBlocked });

    expect(onGoalBlocked).toHaveBeenCalledTimes(1);
    expect(requests[0].input[0]).toMatchObject({ type: 'function_call_output', call_id: 'goal_update-1', output: 'A' });
  });

  test('returns the final response after goal completion', async () => {
    const { client, requests } = openaiWithResponses(
      { id: 'resp-2', output: [goalCall('goal_update', { method: 'complete', summary: 'done', evidence: 'verified' })] },
    );
    const onGoalComplete = jest.fn();
    const response = { id: 'resp-1', output: [] };

    await handleToolCalls(client, response, baseRequest, '/tmp', null, undefined, { goalMode: true, onGoalComplete });

    expect(requests).toHaveLength(2);
    expect(requests[0].input[0].content[0].text).toContain('MUST call goal_update');
    expect(requests[1].input[0]).toMatchObject({ type: 'function_call_output', output: 'Goal complete acknowledged.' });
    expect(requests[1].tool_choice).toBe('none');
    expect(onGoalComplete).toHaveBeenCalledWith({ method: 'complete', summary: 'done', evidence: 'verified' });
  });

  test('stops at the configured maximum iterations', async () => {
    const { client, requests } = openaiWithResponses(
      { id: 'resp-2', output: [] },
      { id: 'resp-3', output: [] },
      { id: 'resp-4', output: [] },
    );
    const onGoalLimit = jest.fn();

    await handleToolCalls(client, { id: 'resp-1', output: [] }, baseRequest, '/tmp', null, undefined, {
      goalMode: true,
      goalMaxIterations: 2,
      onGoalLimit,
    });

    expect(requests).toHaveLength(2);
    expect(onGoalLimit).toHaveBeenCalledWith(3);
  });
});

// Focused tool-loop coverage for cancellation, blocked goals, malformed inputs, and image dispatch.
describe('tool-loop edge paths', () => {
  let originalWrite;
  beforeEach(() => { originalWrite = process.stdout.write; process.stdout.write = () => true; });
  afterEach(() => { process.stdout.write = originalWrite; });

  test('handles blocked goal updates and malformed arguments', async () => {
    const { client, requests } = openaiWithResponses({ id: 'blocked-next', output: [] });
    const onGoalLimit = jest.fn();
    const result = await handleToolCalls(client, {
      id: 'blocked-start',
      output: [goalCall('goal_update', { method: 'blocked', reason: 'dependency' })],
    }, baseRequest, '/tmp', null, undefined, { goalMode: true, onGoalLimit });
    expect(result).toEqual({ id: 'blocked-next', output: [] });
    expect(onGoalLimit).toHaveBeenCalledWith(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].input[0].output).toBe('Goal marked blocked.');

    const malformedClient = openaiWithResponses({ id: 'malformed-next', output: [{ ...goalCall('goal_update'), arguments: JSON.stringify({ method: 'complete' }) }] });
    await handleToolCalls(malformedClient.client, {
      id: 'malformed',
      output: [{ ...goalCall('goal_update'), arguments: '{' }],
    }, baseRequest, '/tmp', null, undefined, { goalMode: true });
  });

  test('returns when goal cancellation is observed before and during calls', async () => {
    let cancelled = true;
    const first = { id: 'cancel-before', output: [] };
    await expect(handleToolCalls({ responses: { create: jest.fn() } }, first, baseRequest, '/tmp', null, undefined, {
      goalMode: true, isGoalCancelled: () => cancelled,
    })).resolves.toBe(first);

    cancelled = false;
    let checks = 0;
    const response = { id: 'cancel-during', output: [goalCall('goal_update', { method: 'complete' })] };
    const statusController = { clear: jest.fn(), showExecuting: jest.fn() };
    await expect(handleToolCalls({ responses: { create: jest.fn() } }, response, baseRequest, '/tmp', null, undefined, {
      goalMode: true, isGoalCancelled: () => { checks += 1; if (checks > 1) cancelled = true; return cancelled; }, statusController,
    })).resolves.toBe(response);
    expect(statusController.clear).toHaveBeenCalled();
  });

  test('dispatches image inspection with and without a result', async () => {
    const image = { type: 'function_call', name: 'view_image', call_id: 'image-1', arguments: JSON.stringify({ path: '/tmp/a.png' }) };
    const { client, requests } = openaiWithResponses({ id: 'image-next', output: [] });
    await handleToolCalls(client, { id: 'image-start', output: [image] }, baseRequest, '/tmp', null, undefined, {
      onViewImage: jest.fn().mockResolvedValue('looks good'),
    });
    expect(requests[0].input[0].output).toBe('looks good');

    const mixed = openaiWithResponses({ id: 'mixed-next', output: [{ ...goalCall('goal_update'), arguments: JSON.stringify({ method: 'complete' }) }] });
    await handleToolCalls(mixed.client, { id: 'mixed-start', output: [image, goalCall('goal_update', { method: 'incomplete' }, 'goal-2')] }, baseRequest, '/tmp', null, undefined, { goalMode: true, onViewImage: async () => 'mixed image' });
    expect(mixed.requests[0].tool_choice).toMatchObject({ mode: 'required', tools: [{ name: 'goal_update' }] });

    const fallback = { ...image, call_id: 'image-2' };
    const second = openaiWithResponses({ id: 'image-fallback-next', output: [] });
    await handleToolCalls(second.client, { id: 'image-fallback', output: [fallback] }, baseRequest, '/tmp', null, undefined);
    expect(second.requests[0].input[0].output).toBe('ERROR: image inspection is unavailable');
  });
});
