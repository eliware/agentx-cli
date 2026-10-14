import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { snowflake } from "@eliware/common";

export async function saveGeneratedImage(
  item,
  { directory = path.join(tmpdir(), "agentx-images"), id = snowflake } = {},
) {
  const encoded = String(item?.result ?? "").trim();
  if (!encoded) throw new Error("image generation returned no image data");
  const data = Buffer.from(encoded, "base64");
  if (!data.length) throw new Error("image generation returned invalid image data");
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `generated-${id()}.png`);
  await writeFile(filePath, data);
  return filePath;
}
