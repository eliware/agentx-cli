import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export class SetupTestTerminal extends EventEmitter {
  constructor(isTTY = true) {
    super();
    this.isTTY = isTTY;
  }
  setRawMode() {}
  resume() {}
  pause() {}
}

export class SetupTestOutput {
  text = "";
  write(value) {
    this.text += value;
  }
}

const tempDirs = new Set();
export async function createSetupEnvState(values = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentx-editors-"));
  tempDirs.add(directory);
  return { filePath: path.join(directory, ".agentx"), text: "", values };
}

export async function cleanupSetupEnvStates() {
  await Promise.all(
    [...tempDirs].map((directory) => rm(directory, { recursive: true, force: true })),
  );
  tempDirs.clear();
}

export const sendSetupInput = (input, value) =>
  setImmediate(() => input.emit("data", Buffer.from(value)));
