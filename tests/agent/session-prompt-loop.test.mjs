import { describe, expect, jest, test } from "@jest/globals";
import { runSessionPromptLoop } from "../../src/agent/session-prompt-loop.mjs";

describe("session prompt loop", () => {
  test("processes one-shot initial text exactly once and exits when processing completes", async () => {
    const readPrompt = jest.fn();
    const dispatchInput = jest.fn(async (line) => ({ action: "request", message: line }));
    const processMessage = jest.fn(async () => "exit");
    await runSessionPromptLoop({
      oneShot: true,
      initialMessage: "hello",
      readPrompt,
      handlePromptError: jest.fn(),
      dispatchInput,
      processMessage,
    });
    expect(dispatchInput).toHaveBeenCalledTimes(1);
    expect(dispatchInput).toHaveBeenCalledWith("hello");
    expect(readPrompt).not.toHaveBeenCalled();
  });

  test("converts a missing one-shot message to empty task text", async () => {
    const dispatchInput = jest.fn(async () => ({ action: "exit" }));
    await runSessionPromptLoop({
      oneShot: true,
      readPrompt: jest.fn(),
      handlePromptError: jest.fn(),
      dispatchInput,
      processMessage: jest.fn(),
    });
    expect(dispatchInput).toHaveBeenCalledWith("");
  });

  test("repeats after continue actions and returns on command exit", async () => {
    const readPrompt = jest.fn().mockResolvedValueOnce("empty").mockResolvedValueOnce("quit");
    const dispatchInput = jest
      .fn()
      .mockResolvedValueOnce({ action: "continue" })
      .mockResolvedValueOnce({ action: "exit" });
    const processMessage = jest.fn();
    await runSessionPromptLoop({
      oneShot: false,
      readPrompt,
      handlePromptError: jest.fn(),
      dispatchInput,
      processMessage,
    });
    expect(readPrompt).toHaveBeenCalledTimes(2);
    expect(processMessage).not.toHaveBeenCalled();
  });

  test("continues reading after a processed message does not request exit", async () => {
    const readPrompt = jest.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("quit");
    const dispatchInput = jest
      .fn()
      .mockResolvedValueOnce({ action: "request", message: "first" })
      .mockResolvedValueOnce({ action: "exit" });
    const processMessage = jest.fn().mockResolvedValueOnce(undefined);
    await runSessionPromptLoop({
      oneShot: false,
      readPrompt,
      handlePromptError: jest.fn(),
      dispatchInput,
      processMessage,
    });
    expect(processMessage).toHaveBeenCalledWith("first");
    expect(readPrompt).toHaveBeenCalledTimes(2);
  });

  test("repeats after a cancelled prompt error", async () => {
    const error = Object.assign(new Error("aborted"), { name: "AbortError" });
    const readPrompt = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce("quit");
    const handlePromptError = jest.fn().mockResolvedValueOnce("continue");
    const dispatchInput = jest.fn(async () => ({ action: "exit" }));
    await runSessionPromptLoop({
      oneShot: false,
      readPrompt,
      handlePromptError,
      dispatchInput,
      processMessage: jest.fn(),
    });
    expect(handlePromptError).toHaveBeenCalledWith(error);
    expect(readPrompt).toHaveBeenCalledTimes(2);
  });

  test("returns when prompt error handling requests exit", async () => {
    const readPrompt = jest.fn(async () => {
      throw new Error("eof");
    });
    const handlePromptError = jest.fn(async () => "return");
    await expect(
      runSessionPromptLoop({
        oneShot: false,
        readPrompt,
        handlePromptError,
        dispatchInput: jest.fn(),
        processMessage: jest.fn(),
      }),
    ).resolves.toBeUndefined();
  });

  test("propagates prompt errors when handling rejects", async () => {
    const error = new Error("unexpected");
    await expect(
      runSessionPromptLoop({
        oneShot: false,
        readPrompt: async () => {
          throw error;
        },
        handlePromptError: async () => {
          throw error;
        },
        dispatchInput: jest.fn(),
        processMessage: jest.fn(),
      }),
    ).rejects.toBe(error);
  });

  test("rejects unrecognized prompt error actions", async () => {
    await expect(
      runSessionPromptLoop({
        oneShot: false,
        readPrompt: async () => {
          throw new Error("input");
        },
        handlePromptError: async () => "unexpected",
        dispatchInput: jest.fn(),
        processMessage: jest.fn(),
      }),
    ).rejects.toThrow("Unsupported prompt error action: unexpected");
  });
});
