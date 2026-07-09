import { describe, expect, test } from '@jest/globals';
import { fillLoginForm, formatUsage, renderHeader, setScreen, syncStatus } from '../src/frontend/view.mjs';

class FakeElement {
  constructor(tagName = 'div', ownerDocument = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.textContent = '';
    this.hidden = false;
    this.value = '';
    this.checked = false;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

describe('frontend view helpers', () => {
  test('formats session usage and syncs login state', () => {
    expect(formatUsage({ usage: { inputTokens: 3, outputTokens: 4, turns: 2 } })).toBe('3 in / 4 out / 2 turns');

    const ui = {
      loginScreenEl: new FakeElement('section'),
      sessionScreenEl: new FakeElement('section'),
      usernameInput: new FakeElement('input'),
      passwordInput: new FakeElement('input'),
      rememberInput: new FakeElement('input'),
      autologinInput: new FakeElement('input'),
      statusEl: new FakeElement('span'),
      wsStatusEl: new FakeElement('span'),
      cwdEl: new FakeElement('strong'),
      responseIdEl: new FakeElement('strong'),
      usageEl: new FakeElement('strong'),
      summaryEl: new FakeElement('div'),
      sessionBannerEl: new FakeElement('div'),
      inspectorEl: new FakeElement('pre'),
      sessionListEl: new FakeElement('ul'),
    };
    ui.sessionListEl.ownerDocument = new FakeDocument();

    fillLoginForm(ui, { username: 'root', password: 'secret', remember: true, autologin: false });
    expect(ui.usernameInput.value).toBe('root');
    expect(ui.rememberInput.checked).toBe(true);

    setScreen(ui, 'session');
    expect(ui.loginScreenEl.hidden).toBe(true);
    expect(ui.sessionScreenEl.hidden).toBe(false);

    syncStatus(ui, { loggedOut: false, authenticated: true, socketState: 'connected' });
    expect(ui.statusEl.textContent).toBe('connected');
    expect(ui.wsStatusEl.textContent).toBe('connected');

    renderHeader(ui, {
      response_id: 'resp-1',
      usage: { inputTokens: 1, outputTokens: 2, turns: 3 },
      last_assistant_message: 'hello',
      cwd: '/tmp',
    }, { username: 'root', expiresAt: 123 });

    expect(ui.cwdEl.textContent).toBe('/tmp');
    expect(ui.responseIdEl.textContent).toBe('resp-1');
    expect(ui.summaryEl.textContent).toBe('hello');
    expect(ui.sessionBannerEl.hidden).toBe(false);
    expect(ui.sessionListEl.children).toHaveLength(4);
    expect(ui.inspectorEl.textContent).toContain('resp-1');
  });

  test('handles missing ui elements and seeded session lists', () => {
    expect(formatUsage(null)).toBe('0 in / 0 out / 0 turns');
    expect(formatUsage({ usage: {} })).toBe('0 in / 0 out / 0 turns');

    expect(() => fillLoginForm({}, { username: 'root', password: 'secret', remember: true, autologin: true })).not.toThrow();

    const loginUi = {
      usernameInput: new FakeElement('input'),
      passwordInput: new FakeElement('input'),
      rememberInput: new FakeElement('input'),
      autologinInput: new FakeElement('input'),
    };
    fillLoginForm(loginUi, {});
    expect(loginUi.usernameInput.value).toBe('');
    expect(loginUi.passwordInput.value).toBe('');
    expect(loginUi.rememberInput.checked).toBe(false);
    expect(loginUi.autologinInput.checked).toBe(false);

    expect(() => setScreen({}, 'login')).not.toThrow();
    expect(syncStatus({}, { loggedOut: true, authenticated: false, socketState: 'idle' })).toBe('signed out');

    const ui = {
      sessionListEl: new FakeElement('ul'),
    };
    ui.sessionListEl.ownerDocument = new FakeDocument();
    ui.sessionListEl.appendChild(new FakeElement('li'));

    renderHeader(ui, { response_id: '', usage: {}, cwd: '' }, null);
    expect(ui.sessionListEl.children).toHaveLength(1);
  });
});
