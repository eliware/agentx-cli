import { describe, expect, jest, test } from "@jest/globals";
import {
  createStatusLineController,
  formatSpinnerFrame,
} from "../../src/agent-turn/status-controller.mjs";

describe("agent session modules", () => {
  let originalStdoutWrite;
  let stdoutWrites;
  let controllers;

  function createController(...args) {
    const controller = createStatusLineController(...args);
    controllers.push(controller);
    return controller;
  }

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWrites = [];
    controllers = [];
    process.stdout.write = (chunk) => {
      stdoutWrites.push(String(chunk));
      return true;
    };
  });

  afterEach(() => {
    for (const controller of controllers) controller.stop();
    process.stdout.write = originalStdoutWrite;
  });

  test("spinner frame helper returns no animation", () => {
    expect(formatSpinnerFrame(undefined)).toBe("");
  });
  test("status line controller uses the default session start time when omitted", () => {
    jest.useFakeTimers({ now: Date.parse("2026-07-08T00:00:00Z") });
    try {
      const controller = createController();
      controller.showReasoning();
      expect(stdoutWrites.join("")).toContain('{"time":"0s"');
      expect(stdoutWrites.join("")).toContain('\u001b[32m"reasoning":"0s/0s"\u001b[38;5;255m');
    } finally {
      for (const controller of controllers) controller.stop();
      jest.useRealTimers();
    }
  });
  test("status line controller accepts omitted transition options", () => {
    const controller = createController(Date.now());
    expect(controller.snapshot()).toEqual(
      expect.objectContaining({ time: expect.any(String), reasoning: expect.any(Object) }),
    );
    controller.showReasoning();
    expect(stdoutWrites.join("")).toContain('"reasoning":');
    controller.clear();
  });
  test("status line controller can resume without immediately rendering", () => {
    const controller = createController(Date.now());
    controller.showReasoning();
    stdoutWrites = [];
    controller.pause();
    stdoutWrites = [];
    controller.resume({ renderNow: false });

    expect(stdoutWrites.join("")).toBe("");
    controller.clear();
  });
  test("unchanged transitions honor paused and renderNow states", () => {
    const controller = createController(Date.now());
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
    const controller = createController(Date.now());
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
    const controller = createController(Date.now());
    controller.beginWriting();
    controller.pause();
    stdoutWrites = [];
    controller.resume();
    expect(stdoutWrites).toEqual([]);
    controller.clear();
  });
  test("paused phase transitions resume rendering only when requested", () => {
    const controller = createController(Date.now());
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
      const controller = createController(Date.parse("2026-07-08T00:00:00Z"));
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
});
