import { describe, expect, jest, test } from "@jest/globals";
import {
  createStatusLineController,
  formatSpinnerFrame,
} from "../src/agent-turn/status-controller.mjs";

describe("agent session modules", () => {
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

  test("spinner frame helper returns no animation", () => {
    expect(formatSpinnerFrame(undefined)).toBe("");
  });
  test("status line controller uses the default session start time when omitted", () => {
    jest.useFakeTimers({ now: Date.parse("2026-07-08T00:00:00Z") });
    try {
      const controller = createStatusLineController();
      controller.showReasoning();
      expect(stdoutWrites.join("")).toContain('{"time":"0s"');
      expect(stdoutWrites.join("")).toContain('\u001b[32m"reasoning":"0s/0s"\u001b[38;5;255m');
    } finally {
      jest.useRealTimers();
    }
  });
  test("status line controller accepts omitted transition options", () => {
    const controller = createStatusLineController(Date.now());
    expect(controller.snapshot()).toEqual(
      expect.objectContaining({ time: expect.any(String), reasoning: expect.any(Object) }),
    );
    controller.showReasoning();
    expect(stdoutWrites.join("")).toContain('"reasoning":');
    controller.clear();
  });
  test("status line controller can resume without immediately rendering", () => {
    const controller = createStatusLineController(Date.now());
    controller.showReasoning();
    stdoutWrites = [];
    controller.pause();
    stdoutWrites = [];
    controller.resume({ renderNow: false });

    expect(stdoutWrites.join("")).toBe("");
    controller.clear();
  });
  test("unchanged transitions honor paused and renderNow states", () => {
    const controller = createStatusLineController(Date.now());
    controller.showReasoning();
    stdoutWrites = [];
    controller.pause();
    stdoutWrites = [];
    controller.showReasoning();
    controller.showReasoning({ renderNow: false });
    controller.updateExecuting();
    expect(stdoutWrites).toEqual([]);
    controller.resume({ renderNow: false });
    expect(stdoutWrites).toEqual([]);
    controller.clear();
  });
  test("writing transitions suppress status until explicitly allowed", () => {
    const controller = createStatusLineController(Date.now());
    controller.beginWriting();
    stdoutWrites = [];
    controller.showReasoning();
    expect(stdoutWrites).toEqual([]);
    controller.showExecuting(0, 1, { allowStatusAfterOutput: true, renderNow: false });
    expect(stdoutWrites).toEqual([]);
    controller.refresh();
    expect(stdoutWrites.join("")).toContain('"executing":');
    controller.clear();
  });
  test("resuming a writing phase does not render a status frame", () => {
    const controller = createStatusLineController(Date.now());
    controller.beginWriting();
    controller.pause();
    stdoutWrites = [];
    controller.resume();
    expect(stdoutWrites).toEqual([]);
    controller.clear();
  });
  test("paused phase transitions resume rendering only when requested", () => {
    const controller = createStatusLineController(Date.now());
    controller.showReasoning();
    controller.pause();
    stdoutWrites = [];
    controller.showExecuting();
    expect(stdoutWrites).toEqual([]);
    controller.resume();
    expect(stdoutWrites.join("")).toContain('"executing":');
    stdoutWrites = [];
    controller.resume();
    expect(stdoutWrites).toEqual([]);
    controller.clear();
  });
  test("status line controller renders JSON stats and highlights the active state", () => {
    jest.useFakeTimers({ now: Date.parse("2026-07-08T00:00:00Z") });
    try {
      const controller = createStatusLineController(Date.parse("2026-07-08T00:00:00Z"));
      controller.showReasoning();
      expect(stdoutWrites.join("")).toContain(
        '{"time":"0s",\u001b[32m"reasoning":"0s/0s"\u001b[38;5;255m',
      );
      expect(stdoutWrites.join("")).toContain('"executing":"0s/0s"');

      jest.setSystemTime(Date.parse("2026-07-08T00:00:01Z"));
      controller.refresh();
      expect(stdoutWrites.join("")).toContain('{"time":"1s"');

      controller.beginWriting();
      expect(stdoutWrites.join("")).not.toContain("[0s]");
    } finally {
      jest.useRealTimers();
    }
  });
  test("status line controller prints transition lines without a refresh timer", () => {
    jest.useFakeTimers({ now: Date.parse("2026-07-08T00:00:00Z") });
    try {
      const controller = createStatusLineController(Date.parse("2026-07-08T00:00:00Z"), {
        transitionOnly: true,
      });
      controller.showReasoning();
      jest.advanceTimersByTime(1000);
      controller.showExecuting(0, 1);
      controller.updateExecuting(1, 1);
      expect(stdoutWrites.filter((write) => write.endsWith("\n"))).toHaveLength(2);
      expect(stdoutWrites.join("")).not.toContain("\r\x1b[2K");
    } finally {
      jest.useRealTimers();
    }
  });
  test("status line controller suppresses live renders when quiet", () => {
    const controller = createStatusLineController(Date.parse("2026-07-08T00:00:00Z"), {
      quiet: true,
    });
    controller.showReasoning();
    controller.showExecuting();
    controller.updateExecuting();
    controller.refresh();
    controller.beginWriting();
    controller.clear();

    expect(stdoutWrites.join("")).toBe("");
  });
  test("status line controller renders and clears without ANSI when colors are disabled", () => {
    const controller = createStatusLineController(Date.now(), { colors: false });
    controller.showReasoning();
    controller.showExecuting();
    controller.clear();
    expect(stdoutWrites.join("")).not.toContain("\u001b[");
  });
  test("reports whether the status controller is currently writing", () => {
    const controller = createStatusLineController(Date.now());
    expect(controller.isWriting()).toBe(false);
    controller.beginWriting();
    expect(controller.isWriting()).toBe(true);
    controller.clear();
    expect(controller.isWriting()).toBe(false);
  });
  test("clearing after writing does not erase the final streamed response line", () => {
    const controller = createStatusLineController(Date.now());
    controller.showReasoning();
    controller.beginWriting();
    const writesAfterWriting = stdoutWrites.join("");
    controller.clear();

    expect(stdoutWrites.join("")).toBe(writesAfterWriting);
  });
  test("cleanup remains safe if a later status transition happens after output starts", () => {
    const controller = createStatusLineController(Date.now());
    controller.showReasoning();
    controller.beginWriting();
    process.stdout.write("final response");
    controller.showReasoning();
    controller.clear();

    expect(stdoutWrites.join("")).toContain("final response");
    const output = stdoutWrites.join("");
    expect(output.slice(output.indexOf("final response"))).not.toContain("\r\x1b[2K");
  });
  test("status line controller covers repeated transitions, refresh before start, and updateExecuting states", () => {
    jest.useFakeTimers({ now: Date.parse("2026-07-08T00:00:00Z") });
    try {
      const controller = createStatusLineController(Date.parse("2026-07-08T00:00:00Z"));
      controller.refresh();
      controller.updateExecuting();
      controller.showReasoning();
      controller.showReasoning();
      controller.showExecuting();
      controller.updateExecuting();
      controller.beginWriting();
      controller.refresh();
      expect(stdoutWrites.join("")).toContain('{"time":"0s"');
      expect(stdoutWrites.join("")).toContain('[32m"executing":"0s/0s"[38;5;255m');
    } finally {
      jest.useRealTimers();
    }
  });
  test("stop halts refresh timer and clears temporary status", () => {
    jest.useFakeTimers({ now: Date.parse("2026-07-08T00:00:00Z") });
    try {
      const writes = [];
      const original = process.stdout.write;
      process.stdout.write = (chunk) => {
        writes.push(String(chunk));
        return true;
      };
      const controller = createStatusLineController(Date.now());
      controller.showReasoning();
      controller.stop();
      jest.advanceTimersByTime(1000);
      expect(writes.join("")).toContain("\r\x1b[2K");
      process.stdout.write = original;
    } finally {
      jest.useRealTimers();
    }
  });
});
