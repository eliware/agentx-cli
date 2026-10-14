import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { snowflake } from "@eliware/common";
import nodePath from "node:path";

export async function writeSetupEnvAtomically(filePath, text) {
  const directory = nodePath.dirname(filePath);
  const temporaryPath = nodePath.join(
    directory,
    `.${nodePath.basename(filePath)}.${snowflake()}.tmp`,
  );
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, text, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, filePath);
    await chmod(filePath, 0o600);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}
