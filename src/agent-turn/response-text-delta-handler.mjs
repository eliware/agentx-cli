export function createResponseTextDeltaHandler({ streamState, textRenderer }) {
  return (delta) => {
    streamState.markOutput();
    const text = String(delta ?? "");
    streamState.appendStreamedText(text);
    textRenderer.writeTextDelta(text);
  };
}
