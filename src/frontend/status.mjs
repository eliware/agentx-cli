export function makeStatusText(state) {
  if (state.loggedOut) return 'logged out';
  if (state.authenticated && state.socketState === 'connected') return `connected as ${state.username}`;
  if (state.authenticated && state.socketState === 'connecting') return 'connecting websocket';
  if (state.authenticated && state.socketState === 'reconnecting') return 'reconnecting';
  if (state.authenticated) return 'authenticated';
  return 'signed out';
}
