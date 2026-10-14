import { createInterface } from "node:readline/promises";

export async function withSetupReadline(options, run, create = createInterface) {
  const readline = create(options);
  try {
    return await run(readline);
  } finally {
    readline.close();
  }
}
