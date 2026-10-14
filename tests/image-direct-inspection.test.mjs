import { beforeEach, expect, jest, test } from "@jest/globals";

const prepareImageInspectionRequest = jest.fn();
const executeImageBranch = jest.fn();
await jest.unstable_mockModule("../src/image-inspection-request.mjs", () => ({
  MAX_IMAGES: 10,
  MAX_PROMPT_LENGTH: 10000,
  prepareImageInspectionRequest,
}));
await jest.unstable_mockModule("../src/image-branch.mjs", () => ({ executeImageBranch }));
const { runImageInspection } = await import("../src/image-direct-inspection.mjs");

beforeEach(() => {
  prepareImageInspectionRequest.mockReset();
  executeImageBranch.mockReset();
});

test("prepares and executes the direct image branch", async () => {
  const openai = {};
  const args = { prompt: "Inspect", images: [{ path: "x" }] };
  const options = { cwd: "/repo", responseId: "response", previousResponseId: "previous" };
  const request = { input: [] };
  prepareImageInspectionRequest.mockResolvedValue(request);
  executeImageBranch.mockResolvedValue("inspected");
  await expect(runImageInspection(openai, args, options)).resolves.toBe("inspected");
  expect(prepareImageInspectionRequest).toHaveBeenCalledWith(args, {
    cwd: "/repo",
    responseId: "response",
    previousResponseId: "previous",
    callerResponse: undefined,
    model: undefined,
  });
  expect(executeImageBranch).toHaveBeenCalledWith(openai, request, {
    cwd: "/repo",
    onUsage: undefined,
  });
});

test("returns validation output and converts branch errors", async () => {
  prepareImageInspectionRequest.mockResolvedValue("ERROR: image prompt is required");
  await expect(runImageInspection({}, {})).resolves.toBe("ERROR: image prompt is required");
  expect(executeImageBranch).not.toHaveBeenCalled();
  prepareImageInspectionRequest.mockRejectedValueOnce(new Error("cannot read"));
  await expect(runImageInspection({}, {})).resolves.toBe("ERROR: cannot read");
  prepareImageInspectionRequest.mockRejectedValueOnce("bad");
  await expect(runImageInspection({}, {})).resolves.toBe("ERROR: bad");
});
