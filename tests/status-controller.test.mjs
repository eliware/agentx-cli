import { describe, expect, jest, test } from '@jest/globals';
import { formatUsageSummary } from '../src/response.mjs';
import { formatElapsedStatus, formatSpinnerFrame, formatTransactionCompletionMessage, createStatusLineController } from '../src/agent-session/status-controller.mjs';

describe('agent session modules', () => {
  let originalStdoutWrite;
  let stdoutWrites;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutWrites = [];
    process.stdout.write = (chunk) => { stdoutWrites.push(String(chunk)); return true; };
  });

  afterEach(() => { process.stdout.write = originalStdoutWrite; });

  test('status helpers fall back cleanly for undefined timing values', () => {
    expect(formatElapsedStatus(undefined)).toBe('0s');
    expect(formatElapsedStatus(61000)).toBe('1m 1s');
    expect(formatSpinnerFrame(undefined)).toBe('');
  });
  test('status line controller uses the default session start time when omitted', () => {
    jest.useFakeTimers({ now: Date.parse('2026-07-08T00:00:00Z') });
    try {
      const controller = createStatusLineController();
      controller.showReasoning();
      expect(stdoutWrites.join('')).toContain('{"time":"0s"');
      expect(stdoutWrites.join('')).toContain('\u001b[32m"reasoning":"0s/0s"\u001b[38;5;255m');
    } finally {
      jest.useRealTimers();
    }
  });
  test('status line controller accepts omitted transition options', () => {
    const controller = createStatusLineController(Date.now());
    controller.showReasoning();
    expect(stdoutWrites.join('')).toContain('"reasoning":');
    controller.clear();
  });
  test('status line controller can resume without immediately rendering', () => {
    const controller = createStatusLineController(Date.now());
    controller.showReasoning();
    stdoutWrites = [];
    controller.pause();
    stdoutWrites = [];
    controller.resume({ renderNow: false });

    expect(stdoutWrites.join('')).toBe('');
    controller.clear();
  });
  test('status line controller renders JSON stats and highlights the active state', () => {
    jest.useFakeTimers({ now: Date.parse('2026-07-08T00:00:00Z') });
    try {
      const controller = createStatusLineController(Date.parse('2026-07-08T00:00:00Z'));
      controller.showReasoning();
      expect(stdoutWrites.join('')).toContain('{"time":"0s",\u001b[32m"reasoning":"0s/0s"\u001b[38;5;255m');
      expect(stdoutWrites.join('')).toContain('"executing":"0s/0s"');

      jest.setSystemTime(Date.parse('2026-07-08T00:00:01Z'));
      controller.refresh();
      expect(stdoutWrites.join('')).toContain('{"time":"1s"');

      controller.beginWriting();
      expect(stdoutWrites.join('')).not.toContain('[0s]');
    } finally {
      jest.useRealTimers();
    }
  });
  test('status line controller prints transition lines without a refresh timer', () => {
    jest.useFakeTimers({ now: Date.parse('2026-07-08T00:00:00Z') });
    try {
      const controller = createStatusLineController(Date.parse('2026-07-08T00:00:00Z'), { transitionOnly: true });
      controller.showReasoning();
      jest.advanceTimersByTime(1000);
      controller.showExecuting(0, 1);
      controller.updateExecuting(1, 1);
      expect(stdoutWrites.filter((write) => write.endsWith('\n'))).toHaveLength(2);
      expect(stdoutWrites.join('')).not.toContain('\r\x1b[2K');
    } finally {
      jest.useRealTimers();
    }
  });
  test('status line controller suppresses live renders when quiet', () => {
    const controller = createStatusLineController(Date.parse('2026-07-08T00:00:00Z'), { quiet: true });
    controller.showReasoning();
    controller.showExecuting();
    controller.updateExecuting();
    controller.refresh();
    controller.beginWriting();
    controller.clear();

    expect(stdoutWrites.join('')).toBe('');
  });
  test('formatTransactionCompletionMessage handles missing summary fields and non-string status values', () => {
    // With no input, the output should be an empty JSON object
    expect(formatTransactionCompletionMessage()).toBe('{}');
    expect(formatTransactionCompletionMessage({
      time: 42,
      reasoning: { value: '1s/2s' },
      executing: { value: undefined },
      writing: null,
    })).toBe('{"time":"42","reasoning":"1s/2s"}');
  });
  test('reports whether the status controller is currently writing', () => {
    const controller = createStatusLineController(Date.now());
    expect(controller.isWriting()).toBe(false);
    controller.beginWriting();
    expect(controller.isWriting()).toBe(true);
    controller.clear();
    expect(controller.isWriting()).toBe(false);
  });
  test('clearing after writing does not erase the final streamed response line', () => {
    const controller = createStatusLineController(Date.now());
    controller.showReasoning();
    controller.beginWriting();
    const writesAfterWriting = stdoutWrites.join('');
    controller.clear();

    expect(stdoutWrites.join('')).toBe(writesAfterWriting);
  });
  test('cleanup remains safe if a later status transition happens after output starts', () => {
    const controller = createStatusLineController(Date.now());
    controller.showReasoning();
    controller.beginWriting();
    process.stdout.write('final response');
    controller.showReasoning();
    controller.clear();

    expect(stdoutWrites.join('')).toContain('final response');
    const output = stdoutWrites.join('');
    expect(output.slice(output.indexOf('final response'))).not.toContain('\r\x1b[2K');
  });
  test('status line controller covers repeated transitions, refresh before start, and updateExecuting states', () => {
    jest.useFakeTimers({ now: Date.parse('2026-07-08T00:00:00Z') });
    try {
      const controller = createStatusLineController(Date.parse('2026-07-08T00:00:00Z'));
      controller.refresh();
      controller.updateExecuting();
      controller.showReasoning();
      controller.showReasoning();
      controller.showExecuting();
      controller.updateExecuting();
      controller.beginWriting();
      controller.refresh();
      expect(stdoutWrites.join('')).toContain('{"time":"0s"');
      expect(stdoutWrites.join('')).toContain('[32m"executing":"0s/0s"[38;5;255m');
    } finally {
      jest.useRealTimers();
    }
  });
  test('transaction completion message serializes timing values as plain strings', () => {
    expect(formatTransactionCompletionMessage({
      time: '30s',
      reasoning: { active: false, value: '1s/13s' },
      executing: { active: false, value: '5s/6s' },
      writing: { active: false, value: '1s/12s' },
    })).toBe('{"time":"30s","reasoning":"1s/13s","writing":"1s/12s","executing":"5s/6s"}');
  });
  test('transaction completion message omits empty fields', () => {
    expect(formatTransactionCompletionMessage({ time: '30s' })).toBe('{"time":"30s"}');
    expect(
      formatTransactionCompletionMessage({
        time: '30s',
        reasoning: { active: false, value: '' },
        executing: { active: true, value: undefined },
        writing: { active: false, value: null },
      })
    ).toBe('{"time":"30s"}');
  });
  test('formatUsageSummary renders usage stats', () => {
    expect(formatUsageSummary({ usage: { input_tokens: 2, input_tokens_details: { cached_tokens: 1 }, output_tokens: 3 } })).toBe('{"in":"1 ($0.000)","cache":"1 ($0.000)","out":"3 ($0.000)","turns":"1","avg":"$0.000","total":"$0.000"}');
  });
  test('stop halts refresh timer and clears temporary status', () => {
    jest.useFakeTimers({ now: Date.parse('2026-07-08T00:00:00Z') });
    try {
      const writes = [];
      const original = process.stdout.write;
      process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
      const controller = createStatusLineController(Date.now());
      controller.showReasoning();
      controller.stop();
      jest.advanceTimersByTime(1000);
      expect(writes.join('')).toContain('\r\x1b[2K');
      process.stdout.write = original;
    } finally {
      jest.useRealTimers();
    }
  });
});
