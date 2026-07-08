import { makeStatusText } from './status.mjs';

export function formatUsage(session) {
  const usage = session?.usage || {};
  return `${Number(usage.inputTokens ?? 0)} in / ${Number(usage.outputTokens ?? 0)} out / ${Number(usage.turns ?? 0)} turns`;
}

export function fillLoginForm(ui, credentials) {
  if (ui.usernameInput) ui.usernameInput.value = credentials?.username || '';
  if (ui.passwordInput) ui.passwordInput.value = credentials?.password || '';
  if (ui.rememberInput) ui.rememberInput.checked = Boolean(credentials?.remember);
  if (ui.autologinInput) ui.autologinInput.checked = Boolean(credentials?.autologin);
}

export function setScreen(ui, screen) {
  if (ui.loginScreenEl) ui.loginScreenEl.hidden = screen !== 'login';
  if (ui.sessionScreenEl) ui.sessionScreenEl.hidden = screen !== 'session';
}

function seedSessionList(ui) {
  if (!ui.sessionListEl || ui.sessionListEl.children.length !== 0) return;
  const items = ['Current conversation', 'Pinned tools', 'Recent cwd', 'LocalStorage state'];
  items.forEach((text) => {
    const li = ui.sessionListEl.ownerDocument.createElement('li');
    li.textContent = text;
    ui.sessionListEl.appendChild(li);
  });
}

export function renderHeader(ui, session, auth) {
  if (ui.cwdEl) ui.cwdEl.textContent = session.cwd || 'cwd unset';
  if (ui.responseIdEl) ui.responseIdEl.textContent = session.response_id || 'no response id';
  if (ui.usageEl) ui.usageEl.textContent = formatUsage(session);
  if (ui.summaryEl) ui.summaryEl.textContent = session.last_assistant_message || 'Ready for a new turn.';
  if (ui.sessionBannerEl) {
    const hasResume = Boolean(session.response_id);
    ui.sessionBannerEl.hidden = !hasResume;
    ui.sessionBannerEl.textContent = hasResume
      ? `Resume available for response ${session.response_id}`
      : 'Fresh session';
  }
  if (ui.inspectorEl) {
    ui.inspectorEl.textContent = JSON.stringify({
      auth: auth ? { username: auth.username, expiresAt: auth.expiresAt } : null,
      session,
    }, null, 2);
  }
  seedSessionList(ui);
}

export function syncStatus(ui, { loggedOut, authenticated, socketState }) {
  const status = makeStatusText({ loggedOut, authenticated, socketState });
  if (ui.statusEl) ui.statusEl.textContent = status;
  if (ui.wsStatusEl) ui.wsStatusEl.textContent = makeStatusText({ authenticated, socketState });
  return status;
}
