export function parseInternalCommand(message) {
  // Trim input to handle accidental spaces before/after commands.
  message = message.trim();
  if (message === 'quit' || message === 'exit' || message === '/quit' || message === '/exit') {
    return { type: 'exit' };
  }

  // Preserve legacy behavior: `clear` resets session state, `/clear` does the same.
  // The distinction is not yet used elsewhere; tests expect this mapping.
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
