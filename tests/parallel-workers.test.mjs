import { describe, expect, test } from '@jest/globals';
import { parseWorkerUsage, runParallelWorkerFunction } from '../src/parallel-workers.mjs';

describe('parallel workers', () => {
  test('parses structured usage summaries', () => {
    expect(parseWorkerUsage('{"in":"12 ($0.000)","cache":"3 ($0.000)","out":"7 ($0.000)","turns":"2"}')).toEqual({ turns: 2, inputTokens: 12, cachedTokens: 3, outputTokens: 7 });
    expect(parseWorkerUsage('no usage')).toBeNull();
  });
  test('rejects malformed spawn requests', async () => {
    await expect(runParallelWorkerFunction({ type: 'function_call', name: 'spawn_agent', arguments: '{}' }, process.cwd())).resolves.toEqual({ error: 'tasks must contain 1-10 non-empty strings' });
  });

  test('reports unknown agents', async () => {
    await expect(runParallelWorkerFunction({ type: 'function_call', name: 'agent_status', arguments: JSON.stringify({ agent_ids: ['missing-agent'] }) }, process.cwd())).resolves.toEqual({ agents: [{ id: 'missing-agent', status: 'unknown' }], waited: false, timed_out: false });
  });


});
