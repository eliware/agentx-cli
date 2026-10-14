import { encodeImageInput } from "./image-input.mjs";

export async function prepareImageInspectionContent(images, { cwd, detail }) {
  const content = [];
  for (const item of images) {
    const image = await encodeImageInput(item?.path, { cwd, detail });
    if (item?.caption) content.push({ type: "input_text", text: String(item.caption) });
    content.push({ type: "input_image", image_url: image.dataUrl, detail: image.detail });
  }
  return content;
}
