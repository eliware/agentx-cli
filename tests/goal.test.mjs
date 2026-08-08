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
    await expect(runToolCall({ type: 'function_call', name: 'goal_complete', arguments: JSON.stringify({ summary: 'done' }) }, '/tmp')).resolves.toBe(JSON.stringify({ summary: 'done' }));
    await expect(runToolCall({ type: 'function_call', name: 'goal_complete', input: 'input-payload' }, '/tmp')).resolves.toBe('input-payload');
    await expect(runToolCall({ type: 'function_call', name: 'goal_complete' }, '/tmp')).resolves.toBe('{}');
  });

  test('normalizes null persisted goal and malformed goal arguments', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agentx-goal-'));
    try {
      const statePath = join(dir, 'state.json');
      await persistResponseState(statePath, { response_id: 'r1', goal: null });
      await expect(readSessionState(statePath)).resolves.toMatchObject({ response_id: 'r1', goal: null });
      const { client } = openaiWithResponses({ id: 'r2', output: [] });
      const blocked = { type: 'function_call', name: 'goal_blocked', call_id: 'blocked-invalid', arguments: '{bad' };
      const onGoalBlocked = jest.fn();
      await handleToolCalls(client, { id: 'r1', output: [blocked] }, baseRequest, '/tmp', null, undefined, { goalMode: true, goalMaxIterations: 0, onGoalBlocked });
      expect(onGoalBlocked).toHaveBeenCalledWith({});
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
    const response = { id: 'resp-1', output: [goalCall('goal_complete', { summary: 'done', evidence: 'tests' })] };

    await expect(handleToolCalls(client, response, baseRequest, '/tmp', null, runToolCall)).resolves.toBe(response);
    expect(runToolCall).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });

  test('parses input and empty goal tool payloads', async () => {
    const { client } = openaiWithResponses({ id: 'resp-input-next', output: [] }, { id: 'resp-empty-next', output: [] });
    const onGoalComplete = jest.fn();
    await handleToolCalls(client, { id: 'resp-input', output: [{ type: 'function_call', name: 'goal_complete', call_id: 'input-1', input: JSON.stringify({ summary: 'input' }) }] }, baseRequest, '/tmp', null, undefined, { goalMode: true, onGoalComplete });
    await handleToolCalls(client, { id: 'resp-empty', output: [{ type: 'function_call', name: 'goal_complete', call_id: 'empty-1' }] }, baseRequest, '/tmp', null, undefined, { goalMode: true, onGoalComplete });
    expect(onGoalComplete).toHaveBeenNthCalledWith(1, { summary: 'input' });
    expect(onGoalComplete).toHaveBeenNthCalledWith(2, {});
  });

  test('executes goal_complete and invokes completion callback', async () => {
    const { client, requests } = openaiWithResponses({ id: 'resp-next', output: [] });
    const onGoalComplete = jest.fn();
    const response = { id: 'resp-1', output: [goalCall('goal_complete', { summary: 'done', evidence: 'npm test passes' })] };

    const result = await handleToolCalls(client, response, baseRequest, '/tmp', null, undefined, {
      goalMode: true,
      onGoalComplete,
    });

    expect(result).toEqual({ id: 'resp-next', output: [] });
    expect(onGoalComplete).toHaveBeenCalledWith({ summary: 'done', evidence: 'npm test passes' });
    expect(requests[0].input[0]).toMatchObject({ type: 'function_call_output', call_id: 'goal_complete-1', output: 'Goal complete acknowledged.' });
  });

  test('blocks for an answer and resumes with the answer', async () => {
    const { client, requests } = openaiWithResponses(
      { id: 'resp-blocked-next', output: [] },
      { id: 'resp-blocked-final', output: [{ type: 'function_call', name: 'goal_complete', call_id: 'goal-complete-2', arguments: JSON.stringify({ summary: 'done', evidence: 'answer accepted' }) }] },
      { id: 'resp-blocked-complete', output: [] },
    );
    const onGoalBlocked = jest.fn(async ({ question, choices }) => {
      expect(question).toBe('Which approach?');
      expect(choices).toEqual(['A', 'B']);
      return 'A';
    });
    const response = { id: 'resp-1', output: [goalCall('goal_blocked', { question: 'Which approach?', choices: ['A', 'B'] })] };

    await handleToolCalls(client, response, baseRequest, '/tmp', null, undefined, { goalMode: true, onGoalBlocked });

    expect(onGoalBlocked).toHaveBeenCalledTimes(1);
    expect(requests[0].input[0]).toMatchObject({ type: 'function_call_output', call_id: 'goal_blocked-1', output: 'A' });
  });

  test('auto-continues when a goal response has no terminal tool call', async () => {
    const { client, requests } = openaiWithResponses(
      { id: 'resp-2', output: [goalCall('goal_complete', { summary: 'done', evidence: 'verified' })] },
      { id: 'resp-3', output: [] },
    );
    const onGoalComplete = jest.fn();
    const response = { id: 'resp-1', output: [] };

    await handleToolCalls(client, response, baseRequest, '/tmp', null, undefined, { goalMode: true, onGoalComplete });

    expect(requests[0]).toMatchObject({ previous_response_id: 'resp-1', store: true });
    expect(requests[0].input[0].content[0].text).toContain('MUST call goal_complete');
    expect(requests[0].input[0].content[0].text).toContain('(goal text unavailable)');
    expect(onGoalComplete).toHaveBeenCalledWith({ summary: 'done', evidence: 'verified' });
    expect(requests[1].previous_response_id).toBe('resp-2');
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
