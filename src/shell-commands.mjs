export function parseInternalCommand(message) {
  // Trim input to handle accidental spaces before/after commands.
  message = message.trim();
  if (message === 'quit' || message === 'exit' || message === '/quit' || message === '/exit') {
    return { type: 'exit' };
  }

  // `clear` and `/clear` both reset session state per spec.
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
