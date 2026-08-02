import { formatOpenAIError } from './error-details.mjs';
import { emitKeypressEvents } from 'node:readline';
import { stdin as defaultInput, stdout as defaultOutput } from 'node:process';

const OPTIONS = [
  { id: 'retry', label: 'Retry the request once' },
  { id: 'new-chain', label: 'Start a new response chain and retry' },
  { id: 'rollback', label: 'Rollback to a successful checkpoint' },
  { id: 'clear', label: 'Clear the session' },
  { id: 'continue', label: 'Return to the prompt' },
];

export async function promptRecoveryMenu(error, { input = defaultInput, output = defaultOutput, forceInteractive = false } = {}) {
  const interactive = forceInteractive || (!process.env.JEST_WORKER_ID && !process.env.CI && input?.isTTY !== false && typeof input?.setRawMode === 'function');
  if (!interactive) return 'continue';
  emitKeypressEvents(input); input.resume?.(); input.setRawMode?.(true); output.write?.('\x1b[?25l');
  let selected = 0; let count = 0;
  const render = () => {
    if (count) output.write(`\x1b[${count - 1}A\r\x1b[0J`);
    const rows = [`OpenAI request failed: ${formatOpenAIError(error)}`, 'Choose recovery:'];
    OPTIONS.forEach((option, index) => rows.push(`${index === selected ? '>' : ' '} ${index + 1}. ${option.label}`));
    rows.push('', 'Use 1-5, ↑/↓, or Enter.');
    output.write(rows.join('\n')); count = rows.length;
  };
  return await new Promise((resolve, reject) => {
    const cleanup = () => { output.write?.(`\x1b[${count - 1}A\r\x1b[0J`); input.setRawMode?.(false); output.write?.('\x1b[?25h'); input.removeListener?.('keypress', onKey); };
    const finish = (value) => { cleanup(); resolve(value); };
    const onKey = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') { cleanup(); const e = new Error('Interrupted'); e.name = 'AbortError'; reject(e); return; }
      if (key.name === 'up') selected = (selected + OPTIONS.length - 1) % OPTIONS.length;
      else if (key.name === 'down') selected = (selected + 1) % OPTIONS.length;
      else if (key.name === 'enter' || key.name === 'return') { finish(OPTIONS[selected].id); return; }
      else { const n = Number(String(str ?? '').trim()); if (n >= 1 && n <= OPTIONS.length) { finish(OPTIONS[n - 1].id); return; } }
      render();
    };
    input.on('keypress', onKey); render();
  });
}

export { OPTIONS };
