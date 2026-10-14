export async function defaultConvertToJpeg(buffer, options, loadSharp = () => import("sharp")) {
  let sharp;
  try {
    ({ default: sharp } = await loadSharp());
  } catch {
    throw new Error("Image conversion requires the optional sharp package.");
  }
  return sharp(buffer)
    .rotate()
    .resize({
      width: options.maxDimension,
      height: options.maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: options.quality })
    .toBuffer();
}
