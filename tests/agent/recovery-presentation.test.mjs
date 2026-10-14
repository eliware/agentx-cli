import { expect, jest, test } from "@jest/globals";
import {
  writeRecoveryDebugEnabled,
  writeRecoverySystem,
} from "../../src/agent/recovery-presentation.mjs";

test("formats system recovery text before writing", () => {
  const write = jest.fn();
  writeRecoverySystem("ready", write);
  expect(write).toHaveBeenCalledWith(expect.stringContaining("ready"));
  expect(write.mock.calls[0][0]).toMatch(/\n$/);
});

test("writes the recovery debug notice", () => {
  const write = jest.fn();
  writeRecoveryDebugEnabled(write);
  expect(write).toHaveBeenCalledWith("[agentx:debug] enabled for retry\n");
});

test("uses terminal writers by default", () => {
  const stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  const stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    writeRecoverySystem("ready");
    writeRecoveryDebugEnabled();
    expect(stdout).toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith("[agentx:debug] enabled for retry\n");
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
});
