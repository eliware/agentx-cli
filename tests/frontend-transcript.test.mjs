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
    expect(node.item.className).toBe('chat-item chat-item--user');
    expect(safeJson({ a: 1 })).toContain('"a": 1');
    expect(extractAssistantText({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'one' }, { type: 'output_text', text: 'two' }] }] })).toBe('one\ntwo');

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
});
