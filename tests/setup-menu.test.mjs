import { beforeEach, describe, expect, jest, test } from "@jest/globals";

let keypresses = [];
const runMenuInteraction = jest.fn(async (options) => {
  options.render();
  let selected;
  const context = { finish: (value) => (selected = value), render: jest.fn() };
  for (const [value, key] of keypresses) options.onKeypress(value, key, context);
  return selected;
});
await jest.unstable_mockModule("../src/menu-interaction.mjs", () => ({ runMenuInteraction }));
const { selectSetupMenu } = await import("../src/setup-menu.mjs");

class Output {
  text = "";
  write(value) {
    this.text += value;
  }
}

describe("setup menu selection", () => {
  beforeEach(() => {
    keypresses = [];
    runMenuInteraction.mockClear();
  });

  test("returns null when raw keyboard input is unavailable", async () => {
    await expect(selectSetupMenu({}, new Output(), [{ id: "one", label: "One" }])).resolves.toBe(
      null,
    );
  });

  test("renders setup paths and maps a numbered choice to its entry", async () => {
    keypresses = [["2", {}]];
    const output = new Output();
    const entries = [
      { id: "one", label: "One" },
      { id: "two", label: "Two" },
    ];
    await expect(
      selectSetupMenu({ setRawMode() {}, on() {} }, output, entries, 9, {
        envPath: "/tmp/config",
      }),
    ).resolves.toBe(entries[1]);
    expect(output.text).toContain("Config File: /tmp/config");
    expect(output.text).toContain("> 1. One");
  });

  test("uses a valid initial selection and supplied install path", async () => {
    const entries = [
      { id: "one", label: "One" },
      { id: "two", label: "Two" },
    ];
    keypresses = [["", { name: "return" }]];
    const output = new Output();
    await expect(
      selectSetupMenu({ setRawMode() {}, on() {} }, output, entries, 1, {
        rootDir: "/tmp/install",
      }),
    ).resolves.toBe(entries[1]);
    expect(output.text).toContain("Install Path: /tmp/install");
    expect(output.text).toContain("> 2. Two");
  });

  test("maps arrow movement and Enter to the selected entry", async () => {
    keypresses = [
      ["", { name: "up" }],
      ["", { name: "down" }],
      ["", { name: "down" }],
      ["", { name: "return" }],
    ];
    const entries = [
      { id: "one", label: "One" },
      { id: "two", label: "Two" },
    ];
    await expect(
      selectSetupMenu({ setRawMode() {}, on() {} }, new Output(), entries),
    ).resolves.toBe(entries[1]);
    expect(runMenuInteraction.mock.calls[0][0].render).toBeDefined();
  });

  test("maps Ctrl-C to the quit entry and ignores invalid keys", async () => {
    keypresses = [
      ["0", {}],
      ["", { ctrl: true, name: "c" }],
    ];
    const entries = [
      { id: "one", label: "One" },
      { id: "quit", label: "Quit" },
    ];
    await expect(
      selectSetupMenu({ setRawMode() {}, on() {} }, new Output(), entries),
    ).resolves.toBe(entries[1]);
  });
});
