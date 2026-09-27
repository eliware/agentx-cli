import { createReplInterface as createReplInterfaceDefault } from "./repl.mjs";

export function createSessionRepl({
  oneShot,
  getCwd,
  input,
  output,
  createInterface = createReplInterfaceDefault,
}) {
  let history = [];
  let readline = oneShot ? null : createInterface(getCwd, input, output, history);

  const preserveHistory = () => {
    if (Array.isArray(readline?.history)) history = [...readline.history];
  };
  const createReadline = () => createInterface(getCwd, input, output, history);
  const setReadline = (next) => {
    readline = next;
  };
  const close = () => readline?.close?.();
  const replace = () => {
    preserveHistory();
    close();
    readline = createReadline();
  };

  return {
    getReadline: () => readline,
    setReadline,
    createReadline,
    preserveHistory,
    close,
    replace,
  };
}
