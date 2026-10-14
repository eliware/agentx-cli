import {
  assertReadableImage,
  MAX_IMAGE_FILE_BYTES,
  resolveImagePath,
} from "./image-file-input.mjs";
import { defaultConvertToJpeg } from "./image-jpeg-conversion.mjs";

const DEFAULT_DETAIL = "low";
const DETAILS = new Set(["low", "auto", "high"]);
const MAX_INPUT_BYTES = MAX_IMAGE_FILE_BYTES;
const DEFAULT_MAX_DIMENSION = 4096;

export async function encodeImageInput(
  filePath,
  {
    cwd = process.cwd(),
    detail = DEFAULT_DETAIL,
    maxBytes = MAX_INPUT_BYTES,
    maxDimension = DEFAULT_MAX_DIMENSION,
    quality = 85,
    convertToJpeg = defaultConvertToJpeg,
  } = {},
) {
  if (!DETAILS.has(detail)) throw new Error(`Invalid image detail: ${detail}`);
  const resolvedPath = resolveImagePath(filePath, cwd);
  const source = await assertReadableImage(resolvedPath, maxBytes);
  const jpeg = await convertToJpeg(source, { maxDimension, quality, path: resolvedPath });
  const data = Buffer.isBuffer(jpeg) ? jpeg : Buffer.from(jpeg);
  if (data.length > maxBytes)
    throw new Error(`Converted image exceeds the ${maxBytes} byte limit.`);
  return {
    path: resolvedPath,
    detail,
    mimeType: "image/jpeg",
    dataUrl: `data:image/jpeg;base64,${data.toString("base64")}`,
    bytes: data.length,
  };
}

export { DEFAULT_DETAIL, DEFAULT_MAX_DIMENSION, MAX_INPUT_BYTES };
