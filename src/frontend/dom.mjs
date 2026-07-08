export function appendLine(listEl, text) {
  if (!listEl) return;
  const ownerDocument = listEl.ownerDocument || globalThis.document;
  const item = ownerDocument?.createElement ? ownerDocument.createElement('li') : { textContent: '' };
  item.textContent = text;
  listEl.appendChild(item);
}

export function queryFrontendElements(document) {
  return {
    form: document.querySelector('[data-login-form]'),
    usernameInput: document.querySelector('[data-login-username]'),
    passwordInput: document.querySelector('[data-login-password]'),
    rememberInput: document.querySelector('[data-login-remember]'),
    loginButton: document.querySelector('[data-login-button]'),
    logoutButton: document.querySelector('[data-logout-button]'),
    statusEl: document.querySelector('[data-status]'),
    detailEl: document.querySelector('[data-detail]'),
    messagesEl: document.querySelector('[data-messages]'),
    wsStateEl: document.querySelector('[data-ws-state]'),
  };
}
