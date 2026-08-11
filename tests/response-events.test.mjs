import { describe, expect, jest, test } from '@jest/globals';
import { sendMessage } from '../src/agent-session/session-service.mjs';
import { createStatusLineController } from '../src/agent-session/status-controller.mjs';
import { createStreamedResponse } from '../src/agent-session/response-stream.mjs';
import { createLiveResponseHandlers } from '../src/agent-session/response-events.mjs';
import { normalizeOutputFlags } from '../src/cli.mjs';

describe('agent session modules', () => {
  let originalStdoutWrite;
  let stdoutWrites;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWrites = [];
    process.stdout.write = (chunk) => { stdoutWrites.push(String(chunk)); return true; };
  });

  afterEach(() => { process.stdout.write = originalStdoutWrite; });

  test('buffers split ANSI escape sequences across text deltas', () => {
    const live = createLiveResponseHandlers({ liveStreaming: true });
    live.handlers.onTextDelta('before \u001b[');
    live.handlers.onTextDelta('31mred');
    live.flushTextDelta();
    expect(stdoutWrites.join('')).toBe('\u001b[38;5;255mbefore \u001b[31mred');
  });
  test('buffers incomplete and non-CSI ANSI fragments safely', () => {
    const live = createLiveResponseHandlers({ liveStreaming: true });
    live.handlers.onTextDelta('x\u001b');
    live.flushTextDelta();
    live.handlers.onTextDelta('y\u001bZ');
    expect(stdoutWrites.join('')).toContain('x');
    expect(stdoutWrites.join('')).toContain('y');
  });

  test('underlines a split reasoning header and continues lime output', () => {
    const live = createLiveResponseHandlers({ liveStreaming: true, statusController: { pause: jest.fn(), resume: jest.fn() } });
    live.handlers.onEvent({ type: 'response.reasoning_summary_text.delta', delta: '**Head' });
    live.handlers.onEvent({ type: 'response.reasoning_summary_text.delta', delta: 'er**\n\nbody' });
    live.handlers.onEvent({ type: 'response.reasoning_summary_text.delta', delta: ' more' });
    live.handlers.onEvent({ type: 'response.reasoning_summary_text.done' });
    const output = stdoutWrites.join('');
    expect(output).toContain('\u001b[4mHeader\u001b[24m');
    expect(output).toContain('body');
    expect(output).toContain(' more');
  });

  test('sendMessage streams live output, streamed arguments, and reasoning transcripts', async () => {
    const template = { model: 'test-model', input: [], tools: [] };
    const calls = [];
    const openai = {
      responses: {
        create: async (request, handlers) => {
          calls.push({ request, handlers: Boolean(handlers) });
          handlers?.onTextDelta(undefined);
          handlers?.onTextDelta('Hi');
          handlers?.onTextDelta(' there');
          handlers?.onEvent?.(
            { type: 'response.function_call_arguments.delta', delta: '{"p":[{"s":["echo ' },
            { raw: '{"type":"response.function_call_arguments.delta","delta":"{\\"p\\":[{\\"s\\":[\\"echo "}', json: { type: 'response.function_call_arguments.delta', delta: '{"p":[{"s":["echo ' } },
          );
          handlers?.onEvent?.(
            { type: 'response.function_call_arguments.delta', delta: 'live"]}]}'},
            { raw: '{"type":"response.function_call_arguments.delta","delta":"live\\"]}]}"}', json: { type: 'response.function_call_arguments.delta', delta: 'live"]}]}' } },
          );
          handlers?.onEvent?.({ type: 'response.function_call_arguments.delta', delta: 'custom' });
          handlers?.onItemDone({ type: 'shell_call', call_id: 'call-1', action: { commands: ['echo live'] } });
          handlers?.onItemDone({ type: 'reasoning', summary: [] });
          handlers?.onItemDone({ type: 'reasoning', summary: [{ type: 'input_text', text: 'thinking' }] });
          handlers?.onEvent?.(
            { type: 'response.completed', response: { id: 'resp-live', output: [] } },
            { raw: '{"type":"response.completed","response":{"id":"resp-live","output":[]}}', json: { type: 'response.completed', response: { id: 'resp-live', output: [] } } },
          );
          return { id: 'resp-live', output: [] };
        },
      },
    };

    await sendMessage(openai, template, '', 'hello', 'AGENTS body', '/tmp/work', null, null, { liveStreaming: true });

    expect(calls).toHaveLength(1);
    expect(calls[0].handlers).toBe(true);
    expect(stdoutWrites.join('')).toContain('Hi');
    expect(stdoutWrites.join('')).toContain('there');
    expect(stdoutWrites.join('')).toContain('[38;5;163m{"p":[{"s":["echo ');
    expect(stdoutWrites.join('')).toContain('[38;5;163mlive"]}]}');
    expect(stdoutWrites.join('')).toContain('\n');
    expect(stdoutWrites.join('')).not.toContain('response.output_item.added');
    expect(stdoutWrites.join('')).not.toContain('response.output_item.done');
    expect(stdoutWrites.join('')).not.toContain('response.completed');
    expect(stdoutWrites.join('')).toContain('thinking');
  });
  test('formats non-shell streamed tool arguments', () => {
    const live = createLiveResponseHandlers({ liveStreaming: true, statusController: { beginWriting: jest.fn(), pause: jest.fn(), resume: jest.fn() } });
    live.handlers.onEvent({ type: 'response.function_call_arguments.delta', delta: 'custom-tool' });
    live.handlers.onItemDone({ type: 'function_call', name: 'custom_tool' });
    live.handlers.onEvent({ type: 'response.shell_call_command.delta', delta: 'shell-tool' });
    live.handlers.onItemDone({ type: 'shell_call' });
    expect(stdoutWrites.join('')).toContain('custom-tool');
    expect(stdoutWrites.join('')).toContain('shell-tool');
    expect(stdoutWrites.at(-1)).toBe('\n');
    const lines = stdoutWrites.join('').split('\n');
    expect(lines[0]).toContain('custom-tool');
    expect(lines[1]).toContain('shell-tool');
  });
  test('suppresses selected streamed output categories without suppressing assistant text', () => {
    const live = createLiveResponseHandlers({
      liveStreaming: true,
      noReasoning: true,
      noShellCalls: true,
      noToolCalls: true,
      noMcp: true,
      noWebsearch: true,
      statusController: { beginWriting: jest.fn(), pause: jest.fn(), resume: jest.fn() },
    });
    live.handlers.onTextDelta('answer');
    live.handlers.onEvent({ type: 'response.reasoning_summary_text.delta', delta: 'reasoning' });
    live.handlers.onEvent({ type: 'response.shell_call_command.delta', delta: 'shell' });
    live.handlers.onEvent({ type: 'response.function_call_arguments.delta', delta: 'tool' });
    live.handlers.onEvent({ type: 'response.mcp_call_arguments.delta', delta: 'mcp' });
    live.handlers.onEvent({ type: 'response.web_search_call.searching' });
    live.handlers.onItemAdded({ type: 'mcp_call', name: 'lookup' });
    live.handlers.onItemDone({ type: 'shell_call' });
    live.handlers.onItemDone({ type: 'function_call', name: 'tool' });
    live.handlers.onItemDone({ type: 'mcp_call' });
    live.handlers.onItemDone({ type: 'web_search_call' });
    live.handlers.onItemDone({ type: 'reasoning', summary: [{ type: 'output_text', text: 'reasoning item' }] });
    expect(stdoutWrites.join('')).toContain('answer');
    expect(stdoutWrites.join('')).not.toContain('shell');
    expect(stdoutWrites.join('')).not.toContain('tool');
    expect(stdoutWrites.join('')).not.toContain('mcp');
    expect(stdoutWrites.join('')).not.toContain('lookup');
    expect(stdoutWrites.join('')).not.toContain('reasoning');
  });
  test('sendMessage ignores unrelated live events and empty streamed deltas', async () => {
    const template = { model: 'test-model', input: [], tools: [] };
    const openai = {
      responses: {
        create: async (_request, handlers) => {
          handlers?.onEvent?.({ type: 'response.output_item.added' }, { raw: '{"type":"response.output_item.added"}' });
          handlers?.onEvent?.({ type: 'response.function_call_arguments.delta', delta: '' }, { raw: '{"type":"response.function_call_arguments.delta","delta":""}' });
          handlers?.onEvent?.({ type: 'response.function_call_arguments.delta' }, { raw: '{"type":"response.function_call_arguments.delta"}' });
          return { id: 'resp-live', output: [] };
        },
      },
    };

    await sendMessage(openai, template, '', 'hello', 'AGENTS body', '/tmp/work', null, null, { liveStreaming: true });

    expect(stdoutWrites.join('')).not.toContain('response.output_item.added');
  });
  test('sendMessage handles reasoning, MCP, and web-search live event branches', async () => {
    const template = { model: 'test-model', input: [], tools: [] };
    const statusController = {
      showReasoning: jest.fn(), showExecuting: jest.fn(), pause: jest.fn(),
      resume: jest.fn(), clear: jest.fn(), beginWriting: jest.fn(),
    };
    const openai = {
      responses: {
        create: async (_request, handlers) => {
          handlers.onEvent({ type: 'response.reasoning_summary_part.delta', delta: '' });
          handlers.onEvent({ type: 'response.reasoning_summary_part.delta', delta: 'thinking' });
          handlers.onEvent({ type: 'response.reasoning_summary_part.done' });
          handlers.onEvent({ type: 'response.mcp_call.in_progress' });
          handlers.onEvent({ type: 'response.mcp_call.progress', progress: 'half' });
          handlers.onEvent({ type: 'response.mcp_call.update', progress_update: 2 });
          handlers.onEvent({ type: 'response.mcp_call.progress', message: 'message' });
          handlers.onEvent({ type: 'response.mcp_call.progress', data: 'data' });
          handlers.onEvent({ type: 'response.mcp_call.progress', payload: 'payload' });
          handlers.onEvent({ type: 'response.mcp_call.progress', status: 'status' });
          handlers.onEvent({ type: 'response.mcp_call.progress', delta: 'delta' });
          handlers.onEvent({ type: 'response.mcp_call.progress' });
          handlers.onEvent({ type: 'response.mcp_call.completed' });
          handlers.onEvent({ type: 'response.mcp_call.failed' });
          handlers.onEvent({ type: 'response.web_search_call.completed' });
          handlers.onEvent({ type: 'response.web_search_call.unknown' });
          return { id: 'resp-live', output: [] };
        },
      },
    };
    await sendMessage(openai, template, '', 'hello', '', '/tmp/work', null, null, {
      liveStreaming: true, statusController,
    });
    const output = stdoutWrites.join('');
    expect(output).toContain('thinking');
    expect(output).toContain('"mcp":"half"');
    expect(output).toContain('"mcp":"2"');
    expect(output).toContain('"mcp":"delta"');
    expect(statusController.pause).toHaveBeenCalled();
    expect(statusController.resume).toHaveBeenCalled();
    expect(statusController.showExecuting).toHaveBeenCalled();
    expect(statusController.showReasoning).toHaveBeenCalled();
  });
  test('sendMessage quiet mode executes MCP responses without rendering MCP output', async () => {
    const template = { model: 'test-model', input: [], tools: [{ type: 'mcp', server_label: 'test' }] };
    const openai = {
      responses: {
        create: async (_request, handlers) => {
          handlers.onTextDelta('answer');
          handlers.onEvent({ type: 'response.mcp_call.in_progress' });
          handlers.onEvent({ type: 'response.mcp_call_arguments.delta', delta: '{"url":"https://example.com"}' });
          handlers.onItemAdded({ type: 'mcp_call', name: 'web-browse' });
          handlers.onItemDone({ type: 'mcp_call' });
          return { id: 'resp-quiet-mcp', output: [] };
        },
      },
    };

    await sendMessage(openai, template, '', 'browse', '', '/tmp/work', null, null, {
      liveStreaming: true, ...normalizeOutputFlags({ quiet: true }), suppressStatusOutput: true, suppressUsageOutput: true,
    });

    expect(stdoutWrites.join('')).toContain('answer');
    expect(stdoutWrites.join('')).not.toContain('web-browse');
    expect(stdoutWrites.join('')).not.toContain('mcp');
  });
  test('sendMessage noMcp mode preserves assistant output while hiding MCP output', async () => {
    const template = { model: 'test-model', input: [], tools: [{ type: 'mcp', server_label: 'test' }] };
    const openai = {
      responses: {
        create: async (_request, handlers) => {
          handlers.onTextDelta('answer');
          handlers.onEvent({ type: 'response.mcp_call.progress', progress: 'hidden' });
          handlers.onItemAdded({ type: 'mcp_call', name: 'hidden-tool' });
          return { id: 'resp-no-mcp', output: [] };
        },
      },
    };

    await sendMessage(openai, template, '', 'browse', '', '/tmp/work', null, null, {
      liveStreaming: true, noMcp: true, suppressStatusOutput: true, suppressUsageOutput: true, noTimers: true,
    });

    expect(stdoutWrites.join('')).toContain('answer');
    expect(stdoutWrites.join('')).not.toContain('hidden-tool');
    expect(stdoutWrites.join('')).not.toContain('hidden');
  });
  test('live handlers stream MCP calls and suppress debug-only output', async () => {
    const template = { model: 'test-model', input: [], tools: [] };
    const statusController = {
      showReasoning: jest.fn(), showExecuting: jest.fn(), pause: jest.fn(),
      resume: jest.fn(), clear: jest.fn(), beginWriting: jest.fn(),
    };
    const originalArgv = process.argv;
    try {
      const normalOpenai = {
        responses: {
          create: async (_request, handlers) => {
            handlers.onItemAdded({ type: 'mcp_call', name: 'lookup' });
            handlers.onItemAdded({ type: 'mcp_call', server_label: 'server' });
            handlers.onItemAdded({ type: 'mcp_call' });
            handlers.onItemAdded({ type: 'message' });
            handlers.onEvent({ type: 'response.mcp_call_arguments.delta', delta: 'abc' });
            handlers.onEvent({ type: 'response.mcp_call_arguments.delta', delta: '' });
            handlers.onEvent({ type: 'response.mcp_call_arguments.delta' });
            handlers.onEvent({ type: 'response.reasoning_summary_text.delta' });
            handlers.onItemDone({ type: 'mcp_call' });
            handlers.onItemDone({ type: 'reasoning', summary: [{ type: 'output_text', text: 'plan' }] });
            return { id: 'resp-mcp', output: [] };
          },
        },
      };
      await createStreamedResponse(normalOpenai, template, { liveStreaming: true, statusController });
      expect(stdoutWrites.join('')).toContain('lookup(');
      expect(stdoutWrites.join('')).toContain('\u001b[38;5;45mlookup(\u001b[0m');
      expect(stdoutWrites.join('')).toContain('\u001b[38;5;45mabc\u001b[0m\u001b[38;5;45m)\u001b[0m\n');
      expect(stdoutWrites.join('')).not.toContain('assistant mcp call:');
      expect(stdoutWrites.join('')).toContain('\u001b[38;5;45mabc\u001b[0m');
      expect(statusController.pause).toHaveBeenCalled();
      expect(statusController.resume).toHaveBeenCalled();
      expect(stdoutWrites.join('')).toContain('plan');

      stdoutWrites.length = 0;
      process.argv = [...originalArgv, '--debug'];
      const debugOpenai = {
        responses: {
          create: async (_request, handlers) => {
            handlers.onEvent({ type: 'response.reasoning_summary_part.delta', delta: 'hidden' });
            handlers.onEvent({ type: 'response.mcp_call_arguments.delta', delta: 'hidden' });
            handlers.onEvent({ type: 'response.mcp_call.progress', progress: 'hidden' });
            handlers.onItemDone({ type: 'reasoning', summary: [{ type: 'output_text', text: 'hidden' }] });
            return { id: 'resp-debug', output: [] };
          },
        },
      };
      await createStreamedResponse(debugOpenai, template, { liveStreaming: true, statusController });
      expect(stdoutWrites.join('')).toContain('{"mcp":"hidden"}');
      expect(stdoutWrites.join('')).not.toContain('\u001b[38;5;213mhidden\u001b[0m');
    } finally {
      process.argv = originalArgv;
    }
  });
  test('live handlers cover optional status branches and web-search shapes', async () => {
    const controller = createStatusLineController(Date.parse('2026-07-08T00:00:00Z'), { quiet: true });
    controller.showReasoning();
    controller.showReasoning({ renderNow: false });
    controller.pause();
    controller.showExecuting(0, 0);
    controller.resume();
    controller.resume();
    controller.beginWriting();
    controller.resume();
    controller.pause();
    controller.beginWriting();
    controller.resume();
    controller.pause();
    controller.showExecuting(0, 0);
    controller.showExecuting(0, 0);
    controller.pause();
    controller.resume();
    controller.beginWriting();
    controller.resume();
    controller.clear();

    const openai = {
      responses: {
        create: async (_request, handlers) => {
          handlers.onEvent({ type: 'response.web_search_call.in_progress' });
          handlers.onEvent({ type: 'response.web_search_call.searching' });
          handlers.onItemDone({ type: 'web_search_call', action: { queries: ['q', '', 1], sources: [{ url: 'https://x.test' }, 'plain', ''] } });
          handlers.onItemDone({ type: 'web_search_call', action: {} });
          handlers.onEvent({ type: 'response.reasoning_summary_part.done' });
          return { id: 'resp-live', output: [] };
        },
      },
    };
    await createStreamedResponse(openai, { model: 'test-model' }, { liveStreaming: true, statusController: controller });
    expect(stdoutWrites.join('')).toContain('https://x.test');
    expect(stdoutWrites.join('')).toContain('plain');

    const noStatusOpenai = {
      responses: {
        create: async (_request, handlers) => {
          handlers.onEvent({ type: 'response.web_search_call.in_progress' });
          handlers.onEvent({ type: 'response.web_search_call.searching' });
          handlers.onItemDone({ type: 'web_search_call', action: { queries: ['q'] } });
          handlers.onEvent({ type: 'response.reasoning_summary_part.done' });
          handlers.onEvent({ type: 'response.mcp_call.progress', progress: 'p' });
          handlers.onEvent({ type: 'response.mcp_call.other' });
          handlers.onEvent({ type: 'response.reasoning_summary_part.other' });
          return { id: 'resp-no-status', output: [] };
        },
      },
    };
    await createStreamedResponse(noStatusOpenai, { model: 'test-model' }, { liveStreaming: true });
  });

  test('non-live handlers are absent', () => {
    expect(createLiveResponseHandlers({ liveStreaming: false }).handlers).toBeNull();
  });

  test('debug handlers suppress reasoning and MCP argument output', () => {
    const statusController = { pause: jest.fn(), beginWriting: jest.fn(), resume: jest.fn() };
    const live = createLiveResponseHandlers({ liveStreaming: true, statusController, debug: true });
    live.handlers.onEvent({ type: 'response.reasoning_summary_text.delta', delta: 'hidden' });
    live.handlers.onEvent({ type: 'response.mcp_call_arguments.delta', delta: 'hidden' });
    live.handlers.onItemDone({ type: 'reasoning', summary: [{ type: 'output_text', text: 'hidden' }] });
    expect(stdoutWrites.join('')).toBe('');
    expect(live.sawOutput()).toBe(false);
  });
});
