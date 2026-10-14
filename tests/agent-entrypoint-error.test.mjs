import { expect, jest, test } from "@jest/globals";
import { reportEntrypointError } from "../src/agent-entrypoint-error.mjs";

test("reports an error message and sets a failure exit code", () => {
  const processRef = { stderr: { write: jest.fn() }, exitCode: 0 };
  reportEntrypointError(new Error("startup failed"), processRef);
  expect(processRef.stderr.write).toHaveBeenCalledWith("startup failed\n");
  expect(processRef.exitCode).toBe(1);
});

test("reports values without a message", () => {
  const processRef = { stderr: { write: jest.fn() }, exitCode: 0 };
  reportEntrypointError("startup failed", processRef);
  expect(processRef.stderr.write).toHaveBeenCalledWith("startup failed\n");
});

test("uses the process default when no process object is supplied", () => {
  const write = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  const previousExitCode = process.exitCode;
  try {
    reportEntrypointError(new Error("default process"));
    expect(write).toHaveBeenCalledWith("default process\n");
    expect(process.exitCode).toBe(1);
  } finally {
    write.mockRestore();
    process.exitCode = previousExitCode;
  }
});
