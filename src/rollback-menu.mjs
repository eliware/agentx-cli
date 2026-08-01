import { emitKeypressEvents } from 'node:readline';
import { stdin as defaultInput, stdout as defaultOutput } from 'node:process';

function preview(value) { return String(value ?? '').replaceAll(/\s+/g, ' ').slice(0, 20); }
function lines(history, selected) {
  const rows = ['Rollback to a successful response checkpoint:', ''];
  history.forEach((entry, index) => {
    const marker = index === selected ? '>' : ' ';
    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'unknown time';
    rows.push(`${marker} ${index + 1}. ${time}  ${JSON.stringify(preview(entry.user_preview))}  ->  ${JSON.stringify(preview(entry.assistant_preview))}`);
  });
  rows.push(`${selected === history.length ? '>' : ' '} ${history.length + 1}. Cancel`);
  rows.push('', `Use 1-${history.length + 1}, ↑/↓, or Enter.`);
  return rows;
}

export async function promptRollbackMenu(history, { input = defaultInput, output = defaultOutput, forceInteractive = false } = {}) {
  if (!history.length) return null;
  const interactive = forceInteractive || (!process.env.JEST_WORKER_ID && !process.env.CI && input?.isTTY !== false && typeof input?.setRawMode === 'function');
  if (!interactive) return null;
  emitKeypressEvents(input); input.resume?.(); input.setRawMode?.(true); output.write?.('\x1b[?25l');
  let selected = 0; let count = 0;
  const render = () => { if (count) output.write(`\x1b[${count - 1}A\r\x1b[0J`); const text = lines(history, selected).join('\n'); output.write(text); count = lines(history, selected).length; };
  return await new Promise((resolve, reject) => {
    const cleanup = () => { output.write?.(`\x1b[${count - 1}A\r\x1b[0J`); input.setRawMode?.(false); output.write?.('\x1b[?25h'); input.removeListener?.('keypress', onKey); };
    const finish = (value) => { cleanup(); resolve(value); };
    const onKey = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') { cleanup(); const e = new Error('Interrupted'); e.name = 'AbortError'; reject(e); return; }
      if (key.name === 'up') selected = (selected + history.length) % (history.length + 1);
      else if (key.name === 'down') selected = (selected + 1) % (history.length + 1);
      else if (key.name === 'enter' || key.name === 'return') { finish(selected === history.length ? null : history[selected]); return; }
      else { const n = Number(String(str ?? '').trim()); if (n >= 1 && n <= history.length + 1) { finish(n === history.length + 1 ? null : history[n - 1]); return; } }
      render();
    };
    input.on('keypress', onKey); render();
  });
}
