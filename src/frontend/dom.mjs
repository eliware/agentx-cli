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
  };
}
