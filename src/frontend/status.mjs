export function makeStatusText(state) {
  if (state.loggedOut) return 'signed out';
  if (state.authenticated && state.socketState === 'connected') return 'connected';
  if (state.authenticated && state.socketState === 'connecting') return 'connecting websocket';
  if (state.authenticated && state.socketState === 'reconnecting') return 'reconnecting';
  if (state.authenticated) return 'authenticated';
  return 'signed out';
}
