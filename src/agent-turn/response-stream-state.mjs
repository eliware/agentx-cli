export function createResponseStreamState(statusController) {
  let sawOutput = false;
  let streamedText = "";
  return {
    markOutput() {
      if (sawOutput) return;
      sawOutput = true;
      statusController?.beginWriting();
    },
    appendStreamedText(text) {
      streamedText += text;
    },
    sawOutput: () => sawOutput,
    streamedText: () => streamedText,
  };
}
