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
  test('queries the expected controls', () => {
    const document = new FakeDocument(new Map([
      ['[data-login-screen]', new FakeElement('section')],
      ['[data-session-screen]', new FakeElement('section')],
      ['[data-login-form]', new FakeElement('form')],
      ['[data-login-username]', new FakeElement('input')],
      ['[data-login-password]', new FakeElement('input')],
      ['[data-login-remember]', new FakeElement('input')],
      ['[data-login-autologin]', new FakeElement('input')],
      ['[data-login-button]', new FakeElement('button')],
      ['[data-session-logout-button]', new FakeElement('button')],
      ['[data-status]', new FakeElement('span')],
      ['[data-ws-status]', new FakeElement('span')],
    ]));

    const elements = queryFrontendElements(document);
    expect(elements.loginScreenEl).not.toBeNull();
    expect(elements.sessionScreenEl).not.toBeNull();
    expect(elements.autologinInput).not.toBeNull();
    expect(elements.sessionLogoutButton).not.toBeNull();
  });

  test('appends message lines for compatibility', () => {
    const messages = new FakeElement('ul');
    appendLine(messages, 'hello');
    expect(messages.children).toHaveLength(1);
    expect(messages.children[0].textContent).toBe('hello');
  });
});
