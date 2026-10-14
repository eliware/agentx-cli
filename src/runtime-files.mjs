import { fs } from "@eliware/common";

export async function readJson(filePath) {
  const content = await fs.promises.readFile(filePath, "utf8");
  return JSON.parse(content);
}

export async function readOptionalText(filePath) {
  try {
    return await fs.promises.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeText(filePath, value) {
  await fs.promises.writeFile(filePath, value, "utf8");
}

export async function deleteOptional(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
