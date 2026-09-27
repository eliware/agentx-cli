import { redactText } from "@eliware/redact";

export function redactWorkerLogText(text, environment = process.env) {
  const secrets = [environment.AGENTX_API_KEY, environment.agentx_api_key].filter(
    (value) => typeof value === "string" && value.length > 0,
  );
  return redactText(text, { secrets });
}

export function selectWorkerOutput(text, options = {}) {
  const maxBytes = Math.min(Math.max(Number(options.output_bytes) || 2048, 1), 8192);
  const offsetBytes = Math.max(Number(options.output_offset) || 0, 0);
  let output;
  if (options.search !== undefined) {
    try {
      const pattern = new RegExp(options.search, "i");
      output = text
        .split(/\r?\n/)
        .filter(Boolean)
        .filter((line) => pattern.test(line))
        .join("\n");
    } catch {
      output = "";
    }
  } else {
    const bytes = Buffer.from(text);
    const end = Math.max(0, bytes.length - offsetBytes);
    output = bytes.subarray(Math.max(0, end - maxBytes), end).toString();
  }
  return Buffer.from(output).subarray(0, maxBytes).toString();
}
