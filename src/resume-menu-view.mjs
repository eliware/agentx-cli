export const RESUME_MENU_OPTIONS = [
  {
    id: "interrupt-retry",
    label: "Resume with interruption notice and let the agent decide whether to retry",
  },
  {
    id: "interrupt-request",
    label: "Resume with interruption notice and request further instructions",
  },
  {
    id: "auto-resume",
    label: "Fully auto-resume pending tool execution",
  },
  {
    id: "new-session",
    label: "Start a new session",
  },
];

export function getMenuLines(savedState, selectedIndex) {
  const lines = [];
  lines.push(`Session ${savedState.response_id} has pending tool calls.`);
  lines.push("Choose how to continue:");
  RESUME_MENU_OPTIONS.forEach((option, index) => {
    const marker = index === selectedIndex ? ">" : " ";
    const shortcut = index + 1;
    const suffix = index === 0 ? " (default)" : "";
    lines.push(`${marker} ${shortcut}. ${option.label}${suffix}`);
  });
  lines.push("Use 1-4, ↑/↓, or Enter.");
  return lines;
}

export function createFrameRenderer(output) {
  let lineCount = 0;
  return {
    render(lines) {
      const text = lines.join("\n");
      if (lineCount > 0) output.write(`\x1b[${lineCount - 1}A\r\x1b[0J`);
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

export function callIfFunction(fn, ...args) {
  if (typeof fn === "function") return fn(...args);
  return undefined;
}

export function attachKeypressListener(input, onKeypress) {
  callIfFunction(input.on?.bind(input), "keypress", onKeypress);
}
