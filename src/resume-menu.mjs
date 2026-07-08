import { emitKeypressEvents } from 'node:readline';
import { stdin as defaultInput, stdout as defaultOutput } from 'node:process';

const RESUME_MENU_OPTIONS = [
  {
    id: 'interrupt-retry',
    label: 'Resume with interruption notice and let the agent decide whether to retry',
  },
  {
    id: 'interrupt-request',
    label: 'Resume with interruption notice and request further instructions',
  },
  {
    id: 'auto-resume',
    label: 'Fully auto-resume pending tool execution',
  },
  {
    id: 'new-session',
    label: 'Start a new session',
  },
];

function getMenuLines(savedState, selectedIndex) {
  const lines = [];
  lines.push(`Session ${savedState.response_id} has pending tool calls.`);
  lines.push('Choose how to continue:');
  RESUME_MENU_OPTIONS.forEach((option, index) => {
    const marker = index === selectedIndex ? '>' : ' ';
    const shortcut = index + 1;
    const suffix = index === 0 ? ' (default)' : '';
    lines.push(`${marker} ${shortcut}. ${option.label}${suffix}`);
  });
  lines.push('Use 1-4, ↑/↓, or Enter.');
  return lines;
}

function createFrameRenderer(output) {
  let lineCount = 0;

  return {
    render(lines) {
      const text = lines.join('\n');
      if (lineCount > 0) {
        output.write(`\x1b[${lineCount - 1}A\r\x1b[0J`);
      }
      output.write(text);
      lineCount = lines.length;
    },
    clear() {
      if (lineCount > 0) {
        output.write(`\x1b[${lineCount - 1}A\r\x1b[0J`);
        lineCount = 0;
      }
    },
  };
}

export async function promptResumeMenu(savedState, { input = defaultInput, output = defaultOutput } = {}) {
  const isInteractive = Boolean(input && output && typeof input.setRawMode === 'function' && input.isTTY !== false);
  let selectedIndex = 0;

  if (!isInteractive) {
    return RESUME_MENU_OPTIONS[selectedIndex].id;
  }

  emitKeypressEvents(input);
  if (typeof input.resume === 'function') input.resume();
  if (typeof input.setRawMode === 'function') input.setRawMode(true);
  if (typeof output.write === 'function') output.write('\x1b[?25l');

  const frame = createFrameRenderer(output);

  return await new Promise((resolve, reject) => {
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      frame.clear();
      if (typeof input.setRawMode === 'function') input.setRawMode(false);
      if (typeof output.write === 'function') output.write('\x1b[?25h');
      if (typeof input.removeListener === 'function') input.removeListener('keypress', onKeypress);
    };

    const finish = (value) => {
      cleanup();
      resolve(value);
    };

    const fail = (error) => {
      cleanup();
      reject(error);
    };

    const render = () => frame.render(getMenuLines(savedState, selectedIndex));

    const selectIndex = (index) => {
      if (index < 0 || index >= RESUME_MENU_OPTIONS.length) return;
      selectedIndex = index;
      render();
      finish(RESUME_MENU_OPTIONS[selectedIndex].id);
    };

    const onKeypress = (str, key = {}) => {
      if (key?.name === 'c' && key?.ctrl) {
        const error = new Error('Interrupted');
        error.name = 'AbortError';
        fail(error);
        return;
      }

      if (key?.name === 'return' || key?.name === 'enter') {
        finish(RESUME_MENU_OPTIONS[selectedIndex].id);
        return;
      }

      if (key?.name === 'up') {
        selectedIndex = (selectedIndex + RESUME_MENU_OPTIONS.length - 1) % RESUME_MENU_OPTIONS.length;
        render();
        return;
      }

      if (key?.name === 'down') {
        selectedIndex = (selectedIndex + 1) % RESUME_MENU_OPTIONS.length;
        render();
        return;
      }

      const digit = String(str ?? '').trim();
      if (/^[1-4]$/.test(digit)) {
        selectIndex(Number(digit) - 1);
      }
    };

    if (typeof input.on === 'function') input.on('keypress', onKeypress);
    render();
  });
}

export { RESUME_MENU_OPTIONS };
