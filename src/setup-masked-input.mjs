export async function askMasked(input, output, prompt, fallback = "") {
  output.write(prompt);
  input.setRawMode?.(true);
  input.resume?.();
  return await new Promise((resolve) => {
    let value = "";
    const onData = (chunk) => {
      for (const char of String(chunk)) {
        if (char === "\r" || char === "\n" || char === "\u0003") {
          input.setRawMode?.(false);
          input.off?.("data", onData);
          if (char !== "\u0003") output.write("\n");
          resolve(char === "\u0003" ? fallback : value || fallback);
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
