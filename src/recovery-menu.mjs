import { formatOpenAIError } from "./error-details.mjs";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { abortMenuInteraction, runMenuInteraction } from "./menu-interaction.mjs";

const OPTIONS = [
  { id: "retry", label: "Retry the request once" },
  { id: "debug-retry", label: "Enable debug mode and retry the request" },
  { id: "new-chain", label: "Start a new response chain and retry" },
  { id: "rollback", label: "Rollback to a successful checkpoint" },
  { id: "clear", label: "Clear the session" },
  { id: "continue", label: "Return to the prompt" },
];

export async function promptRecoveryMenu(
  error,
  { input = defaultInput, output = defaultOutput, forceInteractive = false } = {},
) {
  const interactive =
    forceInteractive ||
    (!process.env.JEST_WORKER_ID &&
      !process.env.CI &&
      input?.isTTY !== false &&
      typeof input?.setRawMode === "function");
  if (!interactive) return "continue";
  let selected = 0;
  let count = 0;
  const render = () => {
    if (count) output.write(`\x1b[${count - 1}A\r\x1b[0J`);
    const rows = [`OpenAI request failed: ${formatOpenAIError(error)}`, "Choose recovery:"];
    OPTIONS.forEach((option, index) =>
      rows.push(`${index === selected ? ">" : " "} ${index + 1}. ${option.label}`),
    );
    rows.push("", "Use 1-6, ↑/↓, or Enter.");
    output.write(rows.join("\n"));
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
      if (key.name === "up") selected = (selected + OPTIONS.length - 1) % OPTIONS.length;
      else if (key.name === "down") selected = (selected + 1) % OPTIONS.length;
      else if (key.name === "enter" || key.name === "return") {
        finish(OPTIONS[selected].id);
        return;
      } else {
        const n = Number(String(str ?? "").trim());
        if (n >= 1 && n <= OPTIONS.length) {
          finish(OPTIONS[n - 1].id);
          return;
        }
      }
      render();
    },
  });
}

export { OPTIONS };
