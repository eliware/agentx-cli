import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import nodePath from "node:path";
import { getSetupPaths } from "./setup-paths.mjs";

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

function decodeEnvValue(value) {
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

function parseEnvLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      return match ? { type: "pair", key: match[1], value: match[2], line } : { type: "raw", line };
    });
}

function serializeEnvValue(value) {
  const text = String(value ?? "");
  if (!text) return "";
  if (/^[A-Za-z0-9_\-.:/]+$/.test(text)) return text;
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function updateEnvText(text, updates) {
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

async function readOptionalText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function readEnvState(filePath = getSetupPaths().envPath) {
  let text = "";
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const values = { AGENTX_API_KEY: "" };
  const knownKeys = new Set(["AGENTX_API_KEY", CONFIG_VERSION_KEY, ...SETTING_KEYS]);
  for (const line of parseEnvLines(text))
    if (line.type === "pair" && knownKeys.has(line.key))
      values[line.key] = decodeEnvValue(line.value);
  if (text && Number(values[CONFIG_VERSION_KEY] || 0) < Number(CONFIG_VERSION)) {
    const updates = { [CONFIG_VERSION_KEY]: CONFIG_VERSION };
    if (values.AGENTX_MODEL === "gpt-5.6-luna") {
      updates.AGENTX_MODEL = "gpt-6-luna";
      values.AGENTX_MODEL = "gpt-6-luna";
    }
    text = await writeEnvState(filePath, updates, text);
  }
  delete values[CONFIG_VERSION_KEY];
  return { filePath, text, values };
}

export async function writeEnvState(filePath, values, baseText = null) {
  const text = baseText === null ? await readOptionalText(filePath) : baseText;
  const updates = Object.fromEntries(Object.keys(values).map((key) => [key, values[key]]));
  const nextText = updateEnvText(text ?? "", updates);
  const directory = nodePath.dirname(filePath);
  const temporaryPath = nodePath.join(
    directory,
    `.${nodePath.basename(filePath)}.${randomUUID()}.tmp`,
  );
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, nextText, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, filePath);
    await chmod(filePath, 0o600);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
  return nextText;
}

export const setupEnvInternals = {
  decodeEnvValue,
  parseEnvLines,
  serializeEnvValue,
  updateEnvText,
};
