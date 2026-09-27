import { getPackageVersion } from "./cli-version.mjs";
import { getSetupPaths } from "./setup-paths.mjs";

export async function askMasked(input, output, prompt, fallback = "") {
  output.write(prompt);
  input.setRawMode?.(true);
  input.resume?.();
  return await new Promise((resolve) => {
    let value = "";
    const onData = (chunk) => {
      for (const char of String(chunk)) {
        if (char === "\r" || char === "\n") {
          input.setRawMode?.(false);
          input.off?.("data", onData);
          output.write("\n");
          resolve(value || fallback);
          return;
        }
        if (char === "\u0003") {
          input.setRawMode?.(false);
          input.off?.("data", onData);
          resolve(fallback);
          return;
        }
        if (char === "\b" || char === "\u007f") {
          if (value) {
            value = value.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }
        if (char >= " ") {
          value += char;
          output.write("*");
        }
      }
    };
    input.on("data", onData);
  });
}

export async function selectSetupMenu(stdin, stdout, entries, initialIndex = 0, paths = {}) {
  if (typeof stdin.setRawMode !== "function" || typeof stdin.on !== "function") return null;
  let selected =
    Number.isInteger(initialIndex) && initialIndex >= 0 && initialIndex < entries.length
      ? initialIndex
      : 0;
  let buffer = "";
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
  render();
  stdin.setRawMode(true);
  stdin.resume();
  return await new Promise((resolve) => {
    const onData = (chunk) => {
      buffer += chunk.toString();
      if (buffer.includes("\x1b[A")) {
        selected = (selected + entries.length - 1) % entries.length;
        buffer = "";
        render();
      } else if (buffer.includes("\x1b[B")) {
        selected = (selected + 1) % entries.length;
        buffer = "";
        render();
      } else if (/^[1-9]$/.test(buffer) && Number(buffer) <= entries.length) {
        selected = Number(buffer) - 1;
        buffer = "";
        stdin.setRawMode(false);
        stdin.off?.("data", onData);
        stdout.write("\n");
        resolve(entries[selected]);
      } else if (buffer.includes("\r") || buffer.includes("\n")) {
        stdin.setRawMode(false);
        stdin.off?.("data", onData);
        stdout.write("\n");
        resolve(entries[selected]);
      } else if (buffer.includes("\u0003")) {
        stdin.setRawMode(false);
        stdin.off?.("data", onData);
        resolve(entries.find((entry) => entry.id === "quit"));
      } else buffer = buffer.length > 8 ? buffer.slice(-8) : buffer;
    };
    stdin.on("data", onData);
  });
}
