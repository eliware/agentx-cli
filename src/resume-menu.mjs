import { emitKeypressEvents } from "node:readline";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import {
  attachKeypressListener,
  callIfFunction,
  createFrameRenderer,
  getMenuLines,
  RESUME_MENU_OPTIONS,
} from "./resume-menu-view.mjs";

export async function promptResumeMenu(
  savedState,
  { input = defaultInput, output = defaultOutput, forceInteractive = false } = {},
) {
  const isInteractive =
    forceInteractive ||
    (!process.env.JEST_WORKER_ID &&
      !process.env.CI &&
      Boolean(input && output && typeof input.setRawMode === "function" && input.isTTY !== false));
  let selectedIndex = 0;

  if (!isInteractive) {
    return RESUME_MENU_OPTIONS[selectedIndex].id;
  }

  emitKeypressEvents(input);
  callIfFunction(input.resume?.bind(input));
  callIfFunction(input.setRawMode?.bind(input), true);
  callIfFunction(output.write?.bind(output), "\x1b[?25l");

  const frame = createFrameRenderer(output);

  return await new Promise((resolve, reject) => {
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      frame.clear();
      callIfFunction(input.setRawMode?.bind(input), false);
      callIfFunction(output.write?.bind(output), "\x1b[?25h");
      callIfFunction(input.removeListener?.bind(input), "keypress", onKeypress);
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
      if (key?.name === "c" && key?.ctrl) {
        const error = new Error("Interrupted");
        error.name = "AbortError";
        fail(error);
        return;
      }

      if (key?.name === "return" || key?.name === "enter") {
        finish(RESUME_MENU_OPTIONS[selectedIndex].id);
        return;
      }

      if (key?.name === "up") {
        selectedIndex =
          (selectedIndex + RESUME_MENU_OPTIONS.length - 1) % RESUME_MENU_OPTIONS.length;
        render();
        return;
      }

      if (key?.name === "down") {
        selectedIndex = (selectedIndex + 1) % RESUME_MENU_OPTIONS.length;
        render();
        return;
      }

      const digit = String(str ?? "").trim();
      if (/^\d$/.test(digit)) {
        selectIndex(Number(digit) - 1);
      }
    };

    attachKeypressListener(input, onKeypress);
    render();
  });
}
