import { writeTerminal } from "../terminal-output.mjs";
import { formatSystemMessage } from "../shell-display.mjs";

export function writeRecoverySystem(text, write = writeTerminal) {
  write(`${formatSystemMessage(text)}\n`);
}

export function writeRecoveryDebugEnabled(write = (text) => process.stderr.write(text)) {
  write("[agentx:debug] enabled for retry\n");
}
