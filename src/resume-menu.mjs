import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { abortMenuInteraction, runMenuInteraction } from "./menu-interaction.mjs";
import { createFrameRenderer, getMenuLines, RESUME_MENU_OPTIONS } from "./resume-menu-view.mjs";

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

  const frame = createFrameRenderer(output);
  const render = () => frame.render(getMenuLines(savedState, selectedIndex));
  return await runMenuInteraction({
    input,
    output,
    render,
    clear: () => frame.clear(),
    onKeypress: (str, key, { finish, fail }) => {
      if (key?.name === "c" && key?.ctrl) return abortMenuInteraction(fail);
      if (key?.name === "return" || key?.name === "enter") {
        finish(RESUME_MENU_OPTIONS[selectedIndex].id);
        return;
      }
      if (key?.name === "up")
        selectedIndex =
          (selectedIndex + RESUME_MENU_OPTIONS.length - 1) % RESUME_MENU_OPTIONS.length;
      else if (key?.name === "down")
        selectedIndex = (selectedIndex + 1) % RESUME_MENU_OPTIONS.length;
      else {
        const digit = String(str ?? "").trim();
        if (/^\d$/.test(digit)) {
          const index = Number(digit) - 1;
          if (index >= 0 && index < RESUME_MENU_OPTIONS.length) {
            selectedIndex = index;
            render();
            finish(RESUME_MENU_OPTIONS[index].id);
            return;
          }
        }
      }
      render();
    },
  });
}
