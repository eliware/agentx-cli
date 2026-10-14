import { getPackageVersion } from "./cli-version.mjs";
import { getSetupPaths } from "./setup-paths.mjs";
import { runMenuInteraction } from "./menu-interaction.mjs";
export { askMasked } from "./setup-masked-input.mjs";

export async function selectSetupMenu(stdin, stdout, entries, initialIndex = 0, paths = {}) {
  if (typeof stdin.setRawMode !== "function" || typeof stdin.on !== "function") return null;
  let selected =
    Number.isInteger(initialIndex) && initialIndex >= 0 && initialIndex < entries.length
      ? initialIndex
      : 0;
  const render = () => {
    stdout.write(`\x1b[2J\x1b[HAgentX ${getPackageVersion()} Setup\n\n`);
    if (paths.rootDir || paths.envPath || paths.mcpPath) {
      const defaults = getSetupPaths();
      stdout.write(
        `Install Path: ${paths.rootDir ?? defaults.rootDir}\nConfig File: ${paths.envPath ?? defaults.envPath}\nMCP Config: ${paths.mcpPath ?? defaults.mcpConfigPath}\n\n`,
      );
    }
    entries.forEach((entry, index) =>
      stdout.write(`${index === selected ? "> " : "  "}${index + 1}. ${entry.label}\n`),
    );
    stdout.write(`\nUse 1-${entries.length}, ↑/↓, or Enter.\n`);
  };
  return runMenuInteraction({
    input: stdin,
    output: stdout,
    render,
    clear: () => stdout.write("\n"),
    onKeypress: (value, key, { finish, render: redraw }) => {
      if (key.name === "up") {
        selected = (selected + entries.length - 1) % entries.length;
        redraw();
      } else if (key.name === "down") {
        selected = (selected + 1) % entries.length;
        redraw();
      } else if (key.name === "return") finish(entries[selected]);
      else if (key.ctrl && key.name === "c") finish(entries.find((entry) => entry.id === "quit"));
      else if (/^[1-9]$/.test(value) && Number(value) <= entries.length)
        finish(entries[Number(value) - 1]);
    },
  });
}
