const CONFIG_VERSION_KEY = "AGENTX_CONFIG_VERSION";
const CONFIG_VERSION = "2";
const SETTING_KEYS = [
  "AGENTX_MODEL",
  "AGENTX_REASONING_MODE",
  "AGENTX_REASONING_EFFORT",
  "AGENTX_REASONING_SUMMARY",
  "AGENTX_OUTPUT_VERBOSITY",
  "AGENTX_COMPACTION_THRESHOLD",
];

export function decodeEnvValue(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(1, -1);
    }
  }
  return text;
}

export function parseEnvLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      return match ? { type: "pair", key: match[1], value: match[2], line } : { type: "raw", line };
    });
}

export function serializeEnvValue(value) {
  const text = String(value ?? "");
  if (!text) return "";
  if (/^[A-Za-z0-9_\-.:/]+$/.test(text)) return text;
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function updateEnvText(text, updates) {
  const lines = String(text ?? "") === "" ? [] : parseEnvLines(text);
  const seen = new Set();
  const output = [];
  for (const line of lines) {
    if (line.type === "pair" && Object.prototype.hasOwnProperty.call(updates, line.key)) {
      if (seen.has(line.key)) continue;
      seen.add(line.key);
      output.push(`${line.key}=${serializeEnvValue(updates[line.key])}`);
    } else output.push(line.line);
  }
  for (const [key, value] of Object.entries(updates))
    if (!seen.has(key)) output.push(`${key}=${serializeEnvValue(value)}`);
  while (output.at(-1) === "") output.pop();
  return `${output.join("\n")}${output.length ? "\n" : ""}`;
}

export function knownSetupKeys() {
  return new Set(["AGENTX_API_KEY", CONFIG_VERSION_KEY, ...SETTING_KEYS]);
}

export function configVersion() {
  return { key: CONFIG_VERSION_KEY, current: CONFIG_VERSION };
}
