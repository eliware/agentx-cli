import { describe, expect, jest, test } from '@jest/globals';
import { isTerminalColorEnabled, setActiveStatusController, setTerminalOutputOptions, writeTerminal } from '../src/terminal-output.mjs';

describe('terminal output', () => {
  test('pauses before writing and resumes after writing', () => {
    const writes = [];
    const original = process.stdout.write;
    process.stdout.write = (chunk) => { writes.push(`write:${chunk}`); return true; };
    const events = [];
    const controller = {
      pause: () => events.push('pause'),
      resume: () => events.push('resume'),
    };
    try {
      writeTerminal('message', controller);
      expect(events).toEqual(['pause', 'resume']);
      expect(writes).toEqual(['write:message']);
    } finally {
      process.stdout.write = original;
    }
  });

  test('uses the registered controller and supports no controller', () => {
    const writes = [];
    const original = process.stdout.write;
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    const pause = jest.fn();
    const resume = jest.fn();
    try {
      setActiveStatusController({ pause, resume });
      writeTerminal('registered');
      setActiveStatusController(null);
      writeTerminal('plain');
      expect(pause).toHaveBeenCalledTimes(1);
      expect(resume).toHaveBeenCalledTimes(1);
      expect(writes).toEqual(['registered', 'plain']);
    } finally {
      setActiveStatusController(null);
      process.stdout.write = original;
    }
  });

  test('strips ANSI output when colors are disabled', () => {
    const original = process.stdout.write;
    const writes = [];
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    try {
      setTerminalOutputOptions({ colors: false });
      expect(isTerminalColorEnabled()).toBe(false);
      writeTerminal('\u001b[31mred\u001b[0m');
      expect(writes).toEqual(['red']);
    } finally {
      setTerminalOutputOptions({ colors: true });
      process.stdout.write = original;
    }
  });

  test('restores colors when output options are omitted', () => {
    setTerminalOutputOptions({ colors: false });
    setTerminalOutputOptions();
    expect(isTerminalColorEnabled()).toBe(true);
  });
});
