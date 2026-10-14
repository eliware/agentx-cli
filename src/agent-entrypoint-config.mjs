import { resolve as resolvePath } from "node:path";

export async function prepareAgentStartup(parsed, { readEnvState, env, cwd }) {
  await readEnvState();
  if (env.AGENTX_MODEL === "gpt-5.6-luna") env.AGENTX_MODEL = "gpt-6-luna";
  if (parsed.flags.cwd === "") throw new Error("--cwd requires a path");
  return {
    cwd: parsed.flags.cwd ? resolvePath(cwd, parsed.flags.cwd) : cwd,
    messageArgs: parsed.messageArgs,
  };
}
