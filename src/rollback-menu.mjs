import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { abortMenuInteraction, runMenuInteraction } from "./menu-interaction.mjs";
import { getRollbackMenuLines } from "./rollback-menu-view.mjs";

export async function promptRollbackMenu(
  history,
  { input = defaultInput, output = defaultOutput, forceInteractive = false } = {},
) {
  if (!history.length) return null;
  const interactive =
    forceInteractive ||
    (!process.env.JEST_WORKER_ID &&
      !process.env.CI &&
      input?.isTTY !== false &&
      typeof input?.setRawMode === "function");
  if (!interactive) return null;
  let selected = 0;
  let count = 0;
  const render = () => {
    if (count) output.write(`\x1b[${count - 1}A\r\x1b[0J`);
    const rows = getRollbackMenuLines(history, selected);
    const text = rows.join("\n");
    output.write(text);
    count = rows.length;
  };
  return await runMenuInteraction({
    input,
    output,
    render,
    clear: () => output.write?.(`\x1b[${count - 1}A\r\x1b[0J`),
    onKeypress: (str, key, { finish, fail }) => {
      if (key.ctrl && key.name === "c") {
        abortMenuInteraction(fail);
        return;
      }
      if (key.name === "up") selected = (selected + history.length) % (history.length + 1);
      else if (key.name === "down") selected = (selected + 1) % (history.length + 1);
      else if (key.name === "enter" || key.name === "return") {
        finish(selected === history.length ? null : history[selected]);
        return;
      } else {
        const n = Number(String(str ?? "").trim());
        if (n >= 1 && n <= history.length + 1) {
          finish(n === history.length + 1 ? null : history[n - 1]);
          return;
        }
      }
      render();
    },
  });
}
