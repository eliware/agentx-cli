import { appendCliTranscript as appendCliTranscriptDefault } from "../request-context.mjs";
import { saveGeneratedImage as saveGeneratedImageDefault } from "../image-generation.mjs";
import { writeTerminal } from "../terminal-output.mjs";
import { formatSystemMessage } from "../shell-display.mjs";

export function handleSessionImageGeneration({
  getTranscript,
  setTranscript,
  saveState,
  saveGeneratedImage = saveGeneratedImageDefault,
  appendTranscript = appendCliTranscriptDefault,
  write = writeTerminal,
  formatSystemMessage: formatMessage = formatSystemMessage,
}) {
  return async ({ item }) => {
    try {
      const filePath = await saveGeneratedImage(item);
      setTranscript(appendTranscript(getTranscript(), "generated image", filePath));
      write(`${formatMessage(`Generated image saved: ${filePath}`)}\n`);
      await saveState();
      return `Generated image saved to ${filePath}`;
    } catch (error) {
      const message = `Unable to save generated image: ${error?.message || String(error)}`;
      write(`${formatMessage(message)}\n`);
      return message;
    }
  };
}
