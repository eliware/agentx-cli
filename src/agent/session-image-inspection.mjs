export function createSessionImageInspection({
  getOpenAI,
  getSessionUsage,
  addUsageTotals,
  inspectImage,
}) {
  return async ({ args, response, previousResponseId, baseRequest, cwd }) =>
    inspectImage(getOpenAI(), args, {
      cwd,
      responseId: response?.id,
      previousResponseId,
      callerResponse: response,
      model: baseRequest?.model,
      processWorker: true,
      onUsage: (usage) => {
        const totals = getSessionUsage();
        addUsageTotals(totals, usage);
        totals.turns += usage.turns || 1;
      },
    });
}
