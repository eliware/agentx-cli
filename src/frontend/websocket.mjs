export function buildWebSocketUrl(windowObj, token) {
  const protocol = windowObj.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${windowObj.location.host}/ws?token=${encodeURIComponent(token)}`;
}
