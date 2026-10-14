import { createInterface as createReadline } from "node:readline/promises";

export async function askToRunSetup({ input, output, createInterface = createReadline }) {
  const rl = createInterface({ input, output });
  try {
    return await rl.question("AgentX is not configured. Run agentx-setup now? [Y/n] ");
  } finally {
    rl.close();
  }
}
