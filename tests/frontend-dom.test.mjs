import { describe, expect, test } from '@jest/globals';
import { appendLine, queryFrontendElements } from '../src/frontend/dom.mjs';

class FakeElement {
  constructor(tagName = 'div', ownerDocument = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.textContent = '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

class FakeDocument {
  constructor(elements) {
    this.elements = elements;
  }

  querySelector(selector) {
    return this.elements.get(selector) || null;
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

describe('frontend dom helpers', () => {
  test('queries the expected controls and appends message lines', () => {
    const messages = new FakeElement('ul');
    const document = new FakeDocument(new Map([
      ['[data-login-form]', new FakeElement('form')],
      ['[data-login-username]', new FakeElement('input')],
      ['[data-login-password]', new FakeElement('input')],
      ['[data-login-remember]', new FakeElement('input')],
      ['[data-login-button]', new FakeElement('button')],
      ['[data-logout-button]', new FakeElement('button')],
      ['[data-status]', new FakeElement('span')],
      ['[data-detail]', new FakeElement('span')],
      ['[data-messages]', messages],
      ['[data-ws-state]', new FakeElement('span')],
    ]));

    const elements = queryFrontendElements(document);
    expect(elements.form).not.toBeNull();
    expect(elements.messagesEl).toBe(messages);

    appendLine(messages, 'hello');
    expect(messages.children).toHaveLength(1);
    expect(messages.children[0].textContent).toBe('hello');
  });
});
