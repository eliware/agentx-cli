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

  if (message === '/rollback') {
    return { type: 'rollback' };
  }

  if (message === '/stop') return { type: 'goal_cancel' };

  if (message === '/goal' || message.startsWith('/goal ')) {
    const value = message.slice(5).trim();
    if (value === 'status') return { type: 'goal_status' };
    if (value === 'cancel' || value === 'stop') return { type: 'goal_cancel' };
    return value ? { type: 'goal', goal: value } : { type: 'goal_help' };
  }

  if (message === 'cd' || message.startsWith('cd ')) {
    return { type: 'cd', target: message.slice(2).trim() };
  }

  return null;
}
