import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { collectToolLoopUsage, writeToolLoopUsage } from "../src/agent-turn/tool-loop-usage.mjs";

describe("tool-loop usage", () => {
  let originalStdoutWrite;
  let stdoutWrites;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWrites = [];
    process.stdout.write = (chunk) => {
      stdoutWrites.push(String(chunk));
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  test("extracts response usage and forwards it with explicit accounting options", () => {
    const onResponseUsage = jest.fn(() => ({
      inputTokens: 3,
      cachedTokens: 1,
      outputTokens: 2,
      turns: 1,
    }));
    const response = {
      usage: { input_tokens: 4, input_tokens_details: { cached_tokens: 1 }, output_tokens: 2 },
    };

    expect(
      collectToolLoopUsage(response, {
        onResponseUsage,
        callbackOptions: { skipIncrement: false },
      }),
    ).toEqual({
      usage: { inputTokens: 3, cachedTokens: 1, outputTokens: 2 },
      cumulativeUsage: { inputTokens: 3, cachedTokens: 1, outputTokens: 2, turns: 1 },
    });
    expect(onResponseUsage).toHaveBeenCalledWith(
      { inputTokens: 3, cachedTokens: 1, outputTokens: 2 },
      { skipIncrement: false },
    );
  });

  test("skips initial accounting and returns empty usage", () => {
    const onResponseUsage = jest.fn();
    expect(
      collectToolLoopUsage(
        { usage: { input_tokens: 4 } },
        { shouldReport: false, onResponseUsage },
      ),
    ).toEqual({
      usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, turns: 0 },
      cumulativeUsage: null,
    });
    expect(onResponseUsage).not.toHaveBeenCalled();
  });

  test("collects usage without a cumulative callback", () => {
    expect(collectToolLoopUsage({ usage: { input_tokens: 5 } })).toEqual({
      usage: { inputTokens: 5, cachedTokens: 0, outputTokens: 0 },
      cumulativeUsage: null,
    });
  });

  test("collects completion usage without adding callback options", () => {
    const onResponseUsage = jest.fn(() => ({ turns: 2 }));
    const response = { usage: { input_tokens: 2, output_tokens: 3 } };
    const result = collectToolLoopUsage(response, { onResponseUsage });
    expect(onResponseUsage).toHaveBeenCalledWith(result.usage);
    expect(result.cumulativeUsage).toEqual({ turns: 2 });
  });

  test("writes per-turn and cumulative reports with model context", () => {
    const usage = { inputTokens: 6, cachedTokens: 4, outputTokens: 6 };
    const cumulativeUsage = { ...usage, turns: 1 };
    writeToolLoopUsage({ usage, cumulativeUsage, model: "test-model" });
    const output = stdoutWrites.join("");
    expect(output).toContain('"in":"6 ($0.000)"');
    expect(output).toContain('"turns":"1"');
  });

  test("suppresses both usage reports when requested", () => {
    writeToolLoopUsage({
      usage: { inputTokens: 1 },
      cumulativeUsage: { inputTokens: 1, turns: 1 },
      model: "test-model",
      suppressOutput: true,
    });
    expect(stdoutWrites).toEqual([]);
  });

  test("writes only the per-turn report when there is no cumulative total", () => {
    writeToolLoopUsage({ usage: { outputTokens: 2 }, model: "test-model" });
    expect(stdoutWrites.join("")).toContain('"out":"2 ($0.000)"');
  });

  test("accepts omitted report arguments", () => {
    writeToolLoopUsage();
    expect(stdoutWrites.join("")).toContain('"in":"0 ($0.000)"');
  });
});
