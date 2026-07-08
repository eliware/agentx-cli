function makeTranscriptNode(document, role, title, bodyText = '') {
  const item = document.createElement('article');
  item.className = `chat-item chat-item--${role}`;

  const header = document.createElement('header');
  header.className = 'chat-item__header';
  header.textContent = title;

  const body = document.createElement('pre');
  body.className = 'chat-item__body';
  body.textContent = bodyText;

  item.append(header, body);
  return { item, body };
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function extractAssistantText(response) {
  const parts = [];
  for (const item of response?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content?.type === 'output_text' && content.text) parts.push(String(content.text));
    }
  }
  return parts.join('\n');
}

export function createTranscriptController({ document = globalThis.document, transcriptEl } = {}) {
  const state = {
    assistantEntry: null,
    toolEntries: new Map(),
    currentAssistantText: '',
    currentToolArgs: new Map(),
  };

  function scrollNode(node) {
    node?.item?.scrollIntoView?.({ block: 'end' });
  }

  function ensureAssistantEntry() {
    if (state.assistantEntry) return state.assistantEntry;
    if (!transcriptEl) return null;
    const node = makeTranscriptNode(document, 'assistant', 'Assistant', '');
    state.assistantEntry = node;
    transcriptEl.appendChild(node.item);
    scrollNode(node);
    return node;
  }

  function ensureToolEntry(callId, title = 'Tool call') {
    if (state.toolEntries.has(callId)) return state.toolEntries.get(callId);
    if (!transcriptEl) return null;
    const node = makeTranscriptNode(document, 'tool', title, '');
    node.item.dataset.callId = callId;
    state.toolEntries.set(callId, node);
    transcriptEl.appendChild(node.item);
    scrollNode(node);
    return node;
  }

  function appendUserMessage(text) {
    if (!transcriptEl) return;
    const node = makeTranscriptNode(document, 'user', 'You', text);
    transcriptEl.appendChild(node.item);
    scrollNode(node);
  }

  function appendAssistantDelta(delta) {
    const node = ensureAssistantEntry();
    if (!node) return;
    state.currentAssistantText += String(delta ?? '');
    node.body.textContent = state.currentAssistantText;
    scrollNode(node);
  }

  function finalizeAssistant(text) {
    const node = ensureAssistantEntry();
    if (!node) return;
    if (text) node.body.textContent = String(text);
    node.item.dataset.complete = 'true';
    scrollNode(node);
  }

  function updateToolEntry(callId, payload) {
    const node = ensureToolEntry(callId, payload?.title || 'Tool call');
    if (!node) return;
    node.body.textContent = safeJson({
      call: payload?.call || null,
      output: payload?.output || null,
    });
    scrollNode(node);
  }

  function beginToolEntry(callId, call) {
    const title = call?.name === 'shell_call' || call?.type === 'shell_call'
      ? 'shell_call'
      : call?.name || call?.type || 'tool';
    const node = ensureToolEntry(callId, title);
    if (!node) return;
    node.body.textContent = safeJson({ call, status: 'running' });
  }

  function handleOpenAIEvent(event) {
    if (!event || typeof event !== 'object') return;

    if (event.type === 'response.created') {
      state.currentAssistantText = '';
      state.assistantEntry = null;
      return;
    }

    if (event.type === 'response.output_text.delta') {
      appendAssistantDelta(event.delta);
      return;
    }

    if (event.type === 'response.output_item.added') {
      const item = event.item;
      if (item?.type === 'shell_call' || item?.type === 'function_call') {
        const callId = String(item.call_id || item.id || `call-${Date.now()}`);
        beginToolEntry(callId, item);
      }
      return;
    }

    if (event.type === 'response.function_call_arguments.delta') {
      const callId = String(event.call_id || event.item_id || 'call');
      const existing = state.currentToolArgs.get(callId) || '';
      const next = `${existing}${String(event.delta ?? '')}`;
      state.currentToolArgs.set(callId, next);
      const node = ensureToolEntry(callId, 'function_call');
      if (node) {
        node.body.textContent = next;
      }
      return;
    }

    if (event.type === 'response.output_item.done') {
      const item = event.item;
      if (item?.type === 'message') {
        finalizeAssistant(state.currentAssistantText || extractAssistantText(item));
      }
      return;
    }

    if (event.type === 'response.completed') {
      finalizeAssistant(state.currentAssistantText || extractAssistantText(event.response));
    }
  }

  function reset() {
    if (transcriptEl) transcriptEl.innerHTML = '';
    state.assistantEntry = null;
    state.toolEntries.clear();
    state.currentAssistantText = '';
    state.currentToolArgs.clear();
  }

  return {
    state,
    reset,
    appendUserMessage,
    appendAssistantDelta,
    finalizeAssistant,
    beginToolEntry,
    updateToolEntry,
    handleOpenAIEvent,
  };
}

export { extractAssistantText, makeTranscriptNode, safeJson };
