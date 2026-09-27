import { describe, expect, jest, test } from "@jest/globals";
import { reportSessionWorkerUsage } from "../../src/agent/session-worker-usage.mjs";

describe("session worker usage output", () => {
  test.each([null, {}, { usage: null }])("skips worker without usage: %s", (worker) => {
    const formatUsageReport = jest.fn();
    const write = jest.fn();
    reportSessionWorkerUsage({ worker, noUsage: false, formatUsageReport, write });
    expect(formatUsageReport).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  test("honors no-usage and formats visible worker usage with the session model", () => {
    const formatUsageReport = jest.fn(() => "usage summary");
    const write = jest.fn();
    reportSessionWorkerUsage({
      worker: { usage: { inputTokens: 12 } },
      noUsage: true,
      model: "test-model",
      formatUsageReport,
      write,
    });
    expect(formatUsageReport).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();

    reportSessionWorkerUsage({
      worker: { usage: { inputTokens: 12 } },
      noUsage: false,
      model: "test-model",
      formatUsageReport,
      write,
    });
    expect(formatUsageReport).toHaveBeenCalledWith({ inputTokens: 12, model: "test-model" });
    expect(write).toHaveBeenCalledWith("\u001b[38;5;33musage summary\u001b[0m\n");
  });
});
