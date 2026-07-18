export function parseInternalCommand(message) {
  if (message === 'quit' || message === 'exit' || message === '/quit' || message === '/exit') {
    return { type: 'exit' };
  }

  if (message === 'clear' || message === '/clear') {
    return { type: 'session_clear' };
  }

  if (message === '/setup') {
    return { type: 'setup' };
  }

  if (message === '/usage') {
    return { type: 'usage' };
  }

  if (message === 'cd' || message.startsWith('cd ')) {
    return { type: 'cd', target: message.slice(2).trim() };
  }

  return null;
}
