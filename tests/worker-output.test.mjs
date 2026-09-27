import { describe, expect, test } from "@jest/globals";
import { redactWorkerLogText, selectWorkerOutput } from "../src/worker-output.mjs";

describe("worker output policies", () => {
  test("redacts inherited API keys from log text", () => {
    expect(
      redactWorkerLogText("key=secret and other=second", {
        AGENTX_API_KEY: "secret",
        agentx_api_key: "second",
      }),
    ).toBe("key=[REDACTED] and other=[REDACTED]");
    expect(
      redactWorkerLogText("Authorization: Bearer secret token=second api_key=third", {
        AGENTX_API_KEY: "secret",
        agentx_api_key: "second",
      }),
    ).toBe("Authorization: [REDACTED] [REDACTED] token=[REDACTED] api_key=[REDACTED]");
    expect(redactWorkerLogText("ordinary output", {})).toBe("ordinary output");
  });

  test("selects bounded log tails, offsets, and regex matches", () => {
    const log = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n");
    expect(selectWorkerOutput(log)).toBe(log);
    expect(selectWorkerOutput(log, { output_bytes: 14, output_offset: 16 })).toBe(
      "line 9\nline 10",
    );
    expect(Buffer.byteLength(selectWorkerOutput("x".repeat(10000)))).toBe(2048);
    expect(selectWorkerOutput(log, { search: "^line (1|2|11|12)$" })).toBe(
      "line 1\nline 2\nline 11\nline 12",
    );
    expect(selectWorkerOutput(log, { search: "[" })).toBe("");
    expect(selectWorkerOutput(log, { output_bytes: -1, output_offset: -1 })).toBe("2");
    expect(selectWorkerOutput(log, { output_bytes: 9000 })).toBe(log);
  });
});
