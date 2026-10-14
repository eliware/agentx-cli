import { emitKeypressEvents } from "node:readline";

export function runMenuInteraction({ input, output, render, clear, onKeypress }) {
  emitKeypressEvents(input);
  input.resume?.();
  input.setRawMode?.(true);
  output.write?.("\x1b[?25l");

  return new Promise((resolve, reject) => {
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      clear();
      input.setRawMode?.(false);
      output.write?.("\x1b[?25h");
      input.removeListener?.("keypress", handleKeypress);
    };
    const finish = (value) => {
      cleanup();
      resolve(value);
    };
    const fail = (error) => {
      cleanup();
      reject(error);
    };
    const handleKeypress = (str, key = {}) => onKeypress(str, key, { finish, fail, render });
    input.on("keypress", handleKeypress);
    render();
  });
}

export function abortMenuInteraction(fail) {
  const error = new Error("Interrupted");
  error.name = "AbortError";
  fail(error);
}
