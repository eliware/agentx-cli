import { resolve as resolvePath } from "node:path";

export async function prepareAgentStartup(parsed, { cwd }) {
  if (parsed.flags.cwd === "") throw new Error("--cwd requires a path");
  return {
    cwd: parsed.flags.cwd ? resolvePath(cwd, parsed.flags.cwd) : cwd,
    messageArgs: parsed.messageArgs,
  };
}
