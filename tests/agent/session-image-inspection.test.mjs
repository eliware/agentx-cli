import { describe, expect, jest, test } from "@jest/globals";
import { createSessionImageInspection } from "../../src/agent/session-image-inspection.mjs";

describe("session image inspection", () => {
  test("passes caller context and adds branch usage to session totals", async () => {
    const usage = { inputTokens: 1, cachedTokens: 0, outputTokens: 2, turns: 0 };
    let branchUsage = { inputTokens: 3, cachedTokens: 1, outputTokens: 4, turns: 2 };
    const inspectImage = jest.fn(async (_client, _args, options) => {
      options.onUsage(branchUsage);
      return "inspected";
    });
    const callback = createSessionImageInspection({
      getOpenAI: () => "client",
      getSessionUsage: () => usage,
      addUsageTotals: (totals, delta) => {
        totals.inputTokens += delta.inputTokens;
        totals.cachedTokens += delta.cachedTokens;
        totals.outputTokens += delta.outputTokens;
      },
      inspectImage,
    });
    await expect(
      callback({
        args: { images: [] },
        response: { id: "caller" },
        previousResponseId: "previous",
        baseRequest: { model: "model" },
        cwd: "/work",
      }),
    ).resolves.toBe("inspected");
    expect(inspectImage).toHaveBeenCalledWith(
      "client",
      { images: [] },
      expect.objectContaining({
        cwd: "/work",
        responseId: "caller",
        previousResponseId: "previous",
        callerResponse: { id: "caller" },
        model: "model",
        processWorker: true,
      }),
    );
    expect(usage).toEqual({ inputTokens: 4, cachedTokens: 1, outputTokens: 6, turns: 2 });
    branchUsage = { inputTokens: 1, cachedTokens: 0, outputTokens: 1 };
    await callback({ args: {}, cwd: "/work" });
    expect(usage.turns).toBe(3);
  });
});
