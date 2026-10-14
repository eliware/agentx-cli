import { path } from "@eliware/common";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { snowflake } from "@eliware/common";
import nodePath from "node:path";
import { getHomeDirectory } from "./platform.mjs";

export function confirmationFilePath(env = process.env) {
  const home = getHomeDirectory(env);
  return home ? path(home, ".agentx-confirmations.json") : "";
}

export function confirmationKey(call, cwd = "") {
  const commands = Array.isArray(call?.action?.commands)
    ? call.action.commands
    : [call?.action?.commands];
  return JSON.stringify({
    type: call?.type || "",
    cwd: String(cwd || ""),
    commands: commands
      .map((value) =>
        String(value ?? "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean),
  });
}

export async function loadGlobalConfirmations(filePath = confirmationFilePath()) {
  if (!filePath) return new Set();
  try {
    const value = JSON.parse(await readFile(filePath, "utf8"));
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return new Set();
    throw error;
  }
}

export async function saveGlobalConfirmations(confirmations, filePath = confirmationFilePath()) {
  if (!filePath) return;
  const directory = nodePath.dirname(filePath);
  const temporaryPath = nodePath.join(
    directory,
    `.${nodePath.basename(filePath)}.${snowflake()}.tmp`,
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporaryPath, `${JSON.stringify([...confirmations].sort(), null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, filePath);
    await chmod(filePath, 0o600);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}
