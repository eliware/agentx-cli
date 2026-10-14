import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const runImageInspection = jest.fn();
const runImageInspectionProcess = jest.fn();
await jest.unstable_mockModule("../src/image-direct-inspection.mjs", () => ({
  MAX_IMAGES: 10,
  MAX_PROMPT_LENGTH: 10000,
  runImageInspection,
}));
await jest.unstable_mockModule("../src/image-worker-bridge.mjs", () => ({
  runImageInspectionProcess,
}));
const { inspectImage } = await import("../src/image-inspector.mjs");

describe("image inspection coordinator", () => {
  beforeEach(() => {
    runImageInspection.mockReset();
    runImageInspectionProcess.mockReset();
  });

  test("routes worker execution to the process bridge", async () => {
    runImageInspectionProcess.mockResolvedValue("validated");
    const args = { prompt: "Inspect", images: [{ path: "x" }] };
    const options = { cwd: process.cwd(), processWorker: true };
    await expect(inspectImage({}, args, options)).resolves.toBe("validated");
    expect(runImageInspectionProcess).toHaveBeenCalledWith(args, options);
  });

  test("routes direct inspection requests to the branch coordinator", async () => {
    const openai = {};
    const args = { prompt: "Inspect", images: [{ path: "x" }] };
    const options = { cwd: "/repo", previousResponseId: "previous" };
    runImageInspection.mockResolvedValue("inspected");
    await expect(inspectImage(openai, args, options)).resolves.toBe("inspected");
    expect(runImageInspection).toHaveBeenCalledWith(openai, args, options);
  });

  test("uses direct inspection when options are omitted", async () => {
    runImageInspection.mockResolvedValue("direct");
    const args = { prompt: "Inspect" };
    await expect(inspectImage({}, args)).resolves.toBe("direct");
    expect(runImageInspection).toHaveBeenCalledWith({}, args, {});
  });
});
