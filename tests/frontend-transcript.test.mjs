import { describe, expect, test } from '@jest/globals';
import { createTranscriptController, extractAssistantText, makeTranscriptNode, safeJson } from '../src/frontend/transcript.mjs';

class FakeElement {
  constructor(tagName = 'div', ownerDocument = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.textContent = '';
    this.dataset = {};
    this.className = '';
  }

  set innerHTML(value) {
    if (value === '') this.children = [];
  }

  get innerHTML() {
    return '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    nodes.forEach((node) => this.appendChild(node));
  }

  scrollIntoView() {}
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

describe('frontend transcript helpers', () => {
  test('renders nodes and streams assistant/tool events', () => {
    const document = new FakeDocument();
    const transcriptEl = new FakeElement('div', document);
    const transcript = createTranscriptController({ document, transcriptEl });

    const node = makeTranscriptNode(document, 'user', 'You', 'hello');
    const defaultNode = makeTranscriptNode(document, 'assistant', 'Assistant');

    expect(node.item.className).toBe('chat-item chat-item--user');
    expect(defaultNode.body.textContent).toBe('');
    expect(safeJson({ a: 1 })).toContain('"a": 1');
    expect(extractAssistantText({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'one' }, { type: 'output_text', text: 'two' }] }] })).toBe('one\ntwo');
    expect(extractAssistantText({ output: [{ type: 'message', content: [{ type: 'tool' }] }] })).toBe('');
    expect(extractAssistantText({ output: [{ type: 'message' }] })).toBe('');

    transcript.appendUserMessage('hello');
    transcript.handleOpenAIEvent({ type: 'response.output_text.delta', delta: 'hel' });
    transcript.handleOpenAIEvent({ type: 'response.output_text.delta', delta: 'lo' });
    transcript.handleOpenAIEvent({ type: 'response.completed', response: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'hello' }] }] } });
    transcript.handleOpenAIEvent({ type: 'response.output_item.added', item: { type: 'function_call', call_id: 'call-1', name: 'demo' } });
    transcript.handleOpenAIEvent({ type: 'response.function_call_arguments.delta', call_id: 'call-1', delta: '{"x":1}' });
    transcript.handleOpenAIEvent({ type: 'response.output_item.done', item: { type: 'message' } });

    expect(transcriptEl.children).toHaveLength(3);
    expect(transcriptEl.children[0].children[1].textContent).toBe('hello');
    expect(transcriptEl.children[1].children[1].textContent).toBe('hello');
    expect(transcriptEl.children[2].children[1].textContent).toContain('"x":1');

    transcript.reset();
    expect(transcriptEl.children).toHaveLength(0);
  });

  test('covers fallback branches and no-op controller behavior', () => {
    const originalStringify = JSON.stringify;
    JSON.stringify = () => {
      throw new Error('boom');
    };

    try {
      expect(safeJson(undefined)).toBe('');
    } finally {
      JSON.stringify = originalStringify;
    }

    const document = new FakeDocument();
    const transcript = createTranscriptController();

    expect(() => transcript.appendUserMessage('hi')).not.toThrow();
    expect(() => transcript.appendAssistantDelta('a')).not.toThrow();
    expect(() => transcript.appendAssistantDelta(undefined)).not.toThrow();
    expect(() => transcript.finalizeAssistant('done')).not.toThrow();
    expect(() => transcript.beginToolEntry('call-1')).not.toThrow();
    expect(() => transcript.updateToolEntry('call-1', { call: { a: 1 }, output: { b: 2 } })).not.toThrow();
    expect(() => transcript.updateToolEntry('call-1', {})).not.toThrow();
    expect(() => transcript.handleOpenAIEvent(null)).not.toThrow();
    expect(() => transcript.handleOpenAIEvent({ type: 'response.created' })).not.toThrow();
    expect(() => transcript.handleOpenAIEvent({ type: 'response.output_item.added', item: { type: 'tool', call_id: 'call-2' } })).not.toThrow();
    expect(() => transcript.handleOpenAIEvent({ type: 'response.function_call_arguments.delta', call_id: 'no-node', delta: 'x' })).not.toThrow();
    expect(() => transcript.handleOpenAIEvent({ type: 'response.output_item.done', item: { type: 'tool' } })).not.toThrow();
    expect(() => transcript.handleOpenAIEvent({ type: 'response.completed', response: { output: [{ type: 'tool' }, { type: 'message', content: [{ type: 'output_text' }, { type: 'output_text', text: 'ok' }] }] } })).not.toThrow();

    const circular = {};
    circular.self = circular;
    expect(safeJson(circular)).toBe('[object Object]');
    expect(safeJson(1n)).toBe('1');
    expect(extractAssistantText()).toBe('');
    expect(extractAssistantText({ output: [{ type: 'tool' }, { type: 'message', content: [{ type: 'output_text' }, { type: 'output_text', text: '' }] }] })).toBe('');

    expect(() => createTranscriptController({ document })).not.toThrow();
    expect(() => transcript.reset()).not.toThrow();
  });

  test('covers tool and event branches with a live transcript element', () => {
    const document = new FakeDocument();
    const transcriptEl = new FakeElement('div', document);
    const transcript = createTranscriptController({ document, transcriptEl });

    transcript.finalizeAssistant('');
    transcript.beginToolEntry('call-default');
    transcript.beginToolEntry('call-shell', { type: 'shell_call' });
    transcript.beginToolEntry('call-fn', { type: 'function_call' });
    transcript.beginToolEntry('call-name', { name: 'demo' });
    transcript.updateToolEntry('call-default', { call: { a: 1 }, output: { b: 2 } });
    transcript.updateToolEntry('call-default', {});

    transcript.handleOpenAIEvent({ type: 'response.output_item.added', item: { type: 'function_call', id: 'item-id' } });
    transcript.handleOpenAIEvent({ type: 'response.output_item.added', item: { type: 'function_call' } });
    transcript.handleOpenAIEvent({ type: 'response.output_item.added', item: { type: 'other' } });

    transcript.handleOpenAIEvent({ type: 'response.function_call_arguments.delta', call_id: 'call-1', delta: 'a' });
    transcript.appendAssistantDelta(undefined);
    transcript.handleOpenAIEvent({ type: 'response.function_call_arguments.delta', item_id: 'call-2' });
    transcript.handleOpenAIEvent({ type: 'response.function_call_arguments.delta', delta: 'z' });

    transcript.handleOpenAIEvent({ type: 'response.output_item.done', item: { type: 'tool' } });
    transcript.handleOpenAIEvent({ type: 'unrelated.event' });
    transcript.handleOpenAIEvent({ type: 'response.output_item.done', item: { type: 'message', content: [{ type: 'output_text', text: 'done' }] } });
    transcript.handleOpenAIEvent({ type: 'response.completed', response: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'done' }] }] } });

    expect(transcriptEl.children.some((child) => child.dataset.complete === 'true')).toBe(true);
    expect(transcriptEl.children.some((child) => child.dataset.callId === 'call-default')).toBe(true);
    expect(transcriptEl.children.some((child) => child.dataset.callId === 'call-shell')).toBe(true);
    expect(transcriptEl.children.some((child) => child.dataset.callId === 'call-fn')).toBe(true);
    expect(transcriptEl.children.some((child) => child.dataset.callId === 'call-name')).toBe(true);
    expect(transcriptEl.children.some((child) => child.dataset.callId === 'item-id')).toBe(true);
    expect(transcriptEl.children.some((child) => typeof child.dataset.callId === 'string' && child.dataset.callId.startsWith('call-'))).toBe(true);
    expect(transcriptEl.children.some((child) => child.children[1].textContent === 'a')).toBe(true);
    expect(transcriptEl.children.some((child) => child.children[1].textContent === 'z')).toBe(true);

    transcript.reset();
    expect(transcriptEl.children).toHaveLength(0);
  });
});
