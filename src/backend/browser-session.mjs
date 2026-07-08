import { createOpenAIResponsesTransport } from '../openai-transport.mjs';
import { buildRequestOverride, loadPromptTemplate, resolveAgentApiKey } from '../agent-flow.mjs';
import { extractTextFromResponse, extractUsage, createUsageTotals, addUsageTotals } from '../response.mjs';
import { toolOutputForCall, runToolCall } from '../tool-dispatch.mjs';
import { readAgentsFromCwdAndParents } from '../shell-agents.mjs';

function isShellToolCall(item) {
  return item?.type === 'shell_call' || (item?.type === 'function_call' && item?.name === 'shell_call');
}

function normalizeUsageTotals(usage) {
  return {
    inputTokens: Number(usage?.inputTokens ?? 0),
    cachedTokens: Number(usage?.cachedTokens ?? 0),
    outputTokens: Number(usage?.outputTokens ?? 0),
    turns: Number(usage?.turns ?? 0),
  };
}

function normalizePendingToolCall(call) {
  if (!call || typeof call !== 'object') return null;
  try {
    return JSON.parse(JSON.stringify(call));
  } catch {
    return {
      type: String(call.type ?? 'function_call'),
      name: call.name == null ? undefined : String(call.name),
      call_id: String(call.call_id ?? call.id ?? ''),
      input: call.input == null ? undefined : String(call.input),
      arguments: call.arguments == null ? undefined : String(call.arguments),
    };
  }
}

function normalizeSessionState(state = {}) {
  return {
    response_id: String(state.response_id ?? ''),
    usage: normalizeUsageTotals(state.usage),
    last_user_message: String(state.last_user_message ?? ''),
    last_assistant_message: String(state.last_assistant_message ?? ''),
    pending_cli_transcript: String(state.pending_cli_transcript ?? ''),
    pending_tool_calls: Array.isArray(state.pending_tool_calls) ? state.pending_tool_calls.map(normalizePendingToolCall).filter(Boolean) : [],
    cwd: String(state.cwd ?? ''),
    updated_at: String(state.updated_at ?? ''),
  };
}

function safeSocketSend(socket, payload) {
  if (!socket || socket.readyState !== 1) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // Ignore send failures; socket close handling will clean up.
  }
}

function mergeHandlers(baseHandlers = {}, extraHandlers = {}) {
  return {
    ...baseHandlers,
    ...extraHandlers,
    onEvent(event, message) {
      extraHandlers.onEvent?.(event, message);
      baseHandlers.onEvent?.(event, message);
    },
    onTextDelta(delta, event) {
      extraHandlers.onTextDelta?.(delta, event);
      baseHandlers.onTextDelta?.(delta, event);
    },
    onItemDone(item, event) {
      extraHandlers.onItemDone?.(item, event);
      baseHandlers.onItemDone?.(item, event);
    },
  };
}

export async function createBrowserChatSession({
  promptPath,
  cwd,
  send,
  initialState = {},
} = {}) {
  const apiKey = resolveAgentApiKey();
  const template = await loadPromptTemplate(promptPath);
  const agentsText = await readAgentsFromCwdAndParents(cwd).catch(() => '');
  const transport = createOpenAIResponsesTransport({ apiKey });

  const state = normalizeSessionState(initialState);

  function snapshot(overrides = {}) {
    return normalizeSessionState({ ...state, ...overrides });
  }

  function updateSessionState(nextState = {}) {
    Object.assign(state, normalizeSessionState({ ...state, ...nextState }));
    return snapshot();
  }

  async function createResponse(request) {
    return await transport.responses.create(request, mergeHandlers({}, {
      onEvent(event) {
        send?.({ type: 'openai.event', event });
      },
    }));
  }

  async function runMessage(userMessage, incomingState = null) {
    if (incomingState) updateSessionState(incomingState);
    state.last_user_message = String(userMessage ?? '');

    const request = buildRequestOverride(
      template,
      state.last_user_message,
      agentsText,
      cwd,
      state.response_id,
    );

    let current = await createResponse(request);

    for (;;) {
      state.response_id = String(current?.id ?? state.response_id ?? '');
      const usage = extractUsage(current);
      addUsageTotals(state.usage, usage);
      state.usage.turns += 1;

      const calls = (current?.output ?? []).filter(isShellToolCall);
      state.pending_tool_calls = calls.map(normalizePendingToolCall).filter(Boolean);
      send?.({ type: 'session.state', state: snapshot() });

      if (calls.length === 0) {
        state.last_assistant_message = extractTextFromResponse(current);
        state.pending_tool_calls = [];
        const nextState = snapshot({
          last_assistant_message: state.last_assistant_message,
        });
        send?.({ type: 'assistant.complete', response_id: state.response_id, text: state.last_assistant_message, state: nextState });
        send?.({ type: 'session.state', state: nextState });
        return current;
      }

      send?.({ type: 'tool.batch', count: calls.length, response_id: state.response_id });
      const outputs = await Promise.all(calls.map(async (call, index) => {
        const callId = String(call?.call_id || call?.id || index);
        send?.({ type: 'tool.start', call_id: callId, call });
        const output = await runToolCall(call, cwd, { isFirstResponse: false, currentResponse: current, callIndex: index, callCount: calls.length });
        const normalized = toolOutputForCall(call, output);
        send?.({ type: 'tool.output', call_id: callId, call, output: normalized });
        send?.({ type: 'tool.done', call_id: callId, call, output: normalized });
        return normalized;
      }));

      current = await createResponse({
        ...template,
        input: outputs,
        previous_response_id: state.response_id,
        store: true,
      });
    }
  }

  return {
    state,
    snapshot,
    updateSessionState,
    runMessage,
    clear() {
      updateSessionState({
        response_id: '',
        usage: createUsageTotals(),
        last_user_message: '',
        last_assistant_message: '',
        pending_cli_transcript: '',
        pending_tool_calls: [],
        cwd,
      });
      send?.({ type: 'session.state', state: snapshot() });
    },
    close() {
      transport.close();
    },
  };
}
