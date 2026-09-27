import { describe, expect, test } from "@jest/globals";
import { appendCliTranscript, buildRequestMessage } from "../src/request-context.mjs";

describe("request context", () => {
  test("appends formatted shell output to the pending CLI transcript", () => {
    expect(appendCliTranscript("", "pwd", "/tmp/work\n")).toBe("! pwd\n/tmp/work");
    expect(appendCliTranscript("! first\none", "pwd")).toBe("! first\none\n\n! pwd");
  });

  test("accumulates multiple shell results for the next request", () => {
    const first = appendCliTranscript("", "ls", "one.txt\ntwo.txt\n");
    const transcript = appendCliTranscript(first, "pwd", "/tmp/work\n");
    expect(transcript).toBe("! ls\none.txt\ntwo.txt\n\n! pwd\n/tmp/work");
  });

  test("formats stdout, stderr, and plain shell results", () => {
    expect(appendCliTranscript("", "cmd", { stdout: "out\n", stderr: "err\n" })).toBe(
      "! cmd\nout\n\nstderr:\nerr",
    );
    expect(appendCliTranscript("", "cmd", { stderr: "err\n" })).toBe("! cmd\nerr");
    expect(appendCliTranscript("", "cmd", { stdout: "out\n" })).toBe("! cmd\nout");
    expect(appendCliTranscript("", "cmd", ["a", "b"])).toBe("! cmd\na,b");
    expect(appendCliTranscript("", "cmd", 42)).toBe("! cmd\n42");
    expect(appendCliTranscript("", "cmd", null)).toBe("! cmd");
  });

  test("composes transcript, working-directory note, and user message in order", () => {
    expect(
      buildRequestMessage({
        pendingCliTranscript: "! pwd\n/tmp/work",
        cwdNote: "cwd note",
        message: "hello",
      }),
    ).toBe(
      "Local shell commands and output since the last assistant message:\n\n! pwd\n/tmp/work\n\ncwd note\n\nhello",
    );
    expect(buildRequestMessage({ message: "hello" })).toBe("hello");
    expect(buildRequestMessage({ pendingCliTranscript: "! pwd", message: "hello" })).toBe(
      "Local shell commands and output since the last assistant message:\n\n! pwd\n\nhello",
    );
    expect(buildRequestMessage({ cwdNote: "cwd note", message: "hello" })).toBe(
      "cwd note\n\nhello",
    );
  });
});
