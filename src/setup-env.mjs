import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { snowflake } from "@eliware/common";
import nodePath from "node:path";
import { getSetupPaths } from "./setup-paths.mjs";
import {
  configVersion,
  decodeEnvValue,
  knownSetupKeys,
  parseEnvLines,
  serializeEnvValue,
  updateEnvText,
} from "./setup-env-format.mjs";

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
  const knownKeys = knownSetupKeys();
  for (const line of parseEnvLines(text))
    if (line.type === "pair" && knownKeys.has(line.key))
      values[line.key] = decodeEnvValue(line.value);
  const version = configVersion();
  if (text && Number(values[version.key] || 0) < Number(version.current)) {
    const updates = { [version.key]: version.current };
    if (values.AGENTX_MODEL === "gpt-5.6-luna") {
      updates.AGENTX_MODEL = "gpt-6-luna";
      values.AGENTX_MODEL = "gpt-6-luna";
    }
    text = await writeEnvState(filePath, updates, text);
  }
  delete values[version.key];
  return { filePath, text, values };
}

export async function writeEnvState(filePath, values, baseText = null) {
  const text = baseText === null ? await readOptionalText(filePath) : baseText;
  const updates = Object.fromEntries(Object.keys(values).map((key) => [key, values[key]]));
  const nextText = updateEnvText(text ?? "", updates);
  const directory = nodePath.dirname(filePath);
  const temporaryPath = nodePath.join(
    directory,
    `.${nodePath.basename(filePath)}.${snowflake()}.tmp`,
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
