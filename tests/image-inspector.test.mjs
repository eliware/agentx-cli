import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const prepareImageInspectionRequest = jest.fn();
const executeImageBranch = jest.fn();
const runImageInspectionProcess = jest.fn();
await jest.unstable_mockModule("../src/image-inspection-request.mjs", () => ({
  MAX_IMAGES: 10,
  MAX_PROMPT_LENGTH: 10000,
  prepareImageInspectionRequest,
}));
await jest.unstable_mockModule("../src/image-branch.mjs", () => ({ executeImageBranch }));
await jest.unstable_mockModule("../src/image-worker-bridge.mjs", () => ({
  runImageInspectionProcess,
}));
const { inspectImage, runImageInspection } = await import("../src/image-inspector.mjs");

describe("image inspection coordinator", () => {
  beforeEach(() => {
    prepareImageInspectionRequest.mockReset();
    executeImageBranch.mockReset();
    runImageInspectionProcess.mockReset();
  });

  test("routes worker execution to the process bridge", async () => {
    runImageInspectionProcess.mockResolvedValue("validated");
    const args = { prompt: "Inspect", images: [{ path: "x" }] };
    const options = { cwd: process.cwd(), processWorker: true };
    await expect(inspectImage({}, args, options)).resolves.toBe("validated");
    expect(runImageInspectionProcess).toHaveBeenCalledWith(args, options);
  });

  test("prepares and executes the direct branch request", async () => {
    const openai = {};
    const args = { prompt: "Inspect", images: [{ path: "x" }] };
    const request = { input: [] };
    prepareImageInspectionRequest.mockResolvedValue(request);
    executeImageBranch.mockResolvedValue("inspected");
    await expect(inspectImage(openai, args)).resolves.toBe("inspected");
    expect(prepareImageInspectionRequest).toHaveBeenCalledWith(args, {
      cwd: undefined,
      responseId: undefined,
      previousResponseId: undefined,
      callerResponse: undefined,
      model: undefined,
    });
    expect(executeImageBranch).toHaveBeenCalledWith(openai, request, {
      cwd: undefined,
      onUsage: undefined,
    });
  });

  test("returns request validation and execution errors as tool output", async () => {
    prepareImageInspectionRequest.mockResolvedValue("ERROR: image prompt is required");
    await expect(runImageInspection({}, {})).resolves.toBe("ERROR: image prompt is required");
    expect(executeImageBranch).not.toHaveBeenCalled();
    prepareImageInspectionRequest.mockRejectedValueOnce(new Error("cannot read"));
    await expect(runImageInspection({}, {})).resolves.toBe("ERROR: cannot read");
    prepareImageInspectionRequest.mockRejectedValueOnce("bad");
    await expect(runImageInspection({}, {})).resolves.toBe("ERROR: bad");
  });
});
