export function appendLine(listEl, text) {
  if (!listEl) return;
  const ownerDocument = listEl.ownerDocument || globalThis.document;
  const item = ownerDocument?.createElement ? ownerDocument.createElement('li') : { textContent: '' };
  item.textContent = text;
  listEl.appendChild(item);
}

export function queryFrontendElements(document) {
  return {
    loginScreenEl: document.querySelector('[data-login-screen]'),
    sessionScreenEl: document.querySelector('[data-session-screen]'),
    form: document.querySelector('[data-login-form]'),
    usernameInput: document.querySelector('[data-login-username]'),
    passwordInput: document.querySelector('[data-login-password]'),
    rememberInput: document.querySelector('[data-login-remember]'),
    autologinInput: document.querySelector('[data-login-autologin]'),
    loginButton: document.querySelector('[data-login-button]'),
    sessionLogoutButton: document.querySelector('[data-session-logout-button]'),
    statusEl: document.querySelector('[data-status]'),
    wsStatusEl: document.querySelector('[data-ws-status]'),
    cwdEl: document.querySelector('[data-cwd]'),
    responseIdEl: document.querySelector('[data-response-id]'),
    usageEl: document.querySelector('[data-usage]'),
    transcriptEl: document.querySelector('[data-transcript]'),
    inspectorEl: document.querySelector('[data-inspector]'),
    sessionBannerEl: document.querySelector('[data-session-banner]'),
    composerForm: document.querySelector('[data-composer-form]'),
    composerInput: document.querySelector('[data-composer-input]'),
    sendButton: document.querySelector('[data-send-button]'),
    clearButton: document.querySelector('[data-clear-button]'),
    shellButton: document.querySelector('[data-shell-button]'),
    assistantStatusEl: document.querySelector('[data-assistant-status]'),
    sessionListEl: document.querySelector('[data-session-list]'),
    toolListEl: document.querySelector('[data-tool-list]'),
    summaryEl: document.querySelector('[data-summary]'),
    resumeButton: document.querySelector('[data-resume-button]'),
  };
}
