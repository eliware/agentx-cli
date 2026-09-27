import { describe, expect, jest, test } from "@jest/globals";
import { createSessionToolConfirmer } from "../../src/agent/session-confirmation.mjs";

function makeConfirmer({
  answer = "n",
  oneShot = false,
  isTTY = true,
  session = new Set(),
  global = new Set(),
} = {}) {
  const question = jest.fn().mockResolvedValue(answer);
  const saveGlobal = jest.fn();
  const confirmer = createSessionToolConfirmer({
    oneShot,
    isTTY,
    getReadline: () => ({ question }),
    sessionConfirmations: session,
    globalConfirmations: global,
    getConfirmationKey: (call, cwd) => `${cwd}:${call.call_id}`,
    saveGlobalConfirmations: saveGlobal,
    globalConfirmationPath: "global-confirmations.json",
  });
  return { confirmer, question, saveGlobal, session, global };
}

describe("session tool confirmation", () => {
  const call = { call_id: "call-1", action: { commands: "  rm   -rf  ./build\n" } };

  test.each([
    ["yes", true],
    ["Y", true],
    ["session", true],
    ["global", true],
    ["no", false],
    ["unknown", false],
  ])("maps %s confirmation choice to %s", async (answer, expected) => {
    const state = makeConfirmer({ answer });
    await expect(state.confirmer(call, "C:/work")).resolves.toBe(expected);
    expect(state.question).toHaveBeenCalledWith(
      "Allow state-changing command: rm -rf ./build [y]es/[n]o/[s]ession/[g]lobal: ",
    );
    if (answer === "session") expect(state.session.has("C:/work:call-1")).toBe(true);
    if (answer === "global") {
      expect(state.global.has("C:/work:call-1")).toBe(true);
      expect(state.saveGlobal).toHaveBeenCalledWith(state.global, "global-confirmations.json");
    }
  });

  test("reuses session/global approvals without prompting", async () => {
    const session = makeConfirmer({ session: new Set(["C:/work:call-1"]) });
    await expect(session.confirmer(call, "C:/work")).resolves.toBe(true);
    expect(session.question).not.toHaveBeenCalled();

    const global = makeConfirmer({ global: new Set(["C:/work:call-1"]) });
    await expect(global.confirmer(call, "C:/work")).resolves.toBe(true);
    expect(global.question).not.toHaveBeenCalled();
  });

  test("prompts with an empty summary when command details are absent", async () => {
    const state = makeConfirmer({ answer: "yes" });
    await expect(state.confirmer({}, "C:/work")).resolves.toBe(true);
    expect(state.question).toHaveBeenCalledWith(
      "Allow state-changing command:  [y]es/[n]o/[s]ession/[g]lobal: ",
    );
  });

  test("uses the standard confirmation key when no key adapter is provided", async () => {
    const sessionConfirmations = new Set();
    const question = jest.fn().mockResolvedValue("session");
    const confirmer = createSessionToolConfirmer({
      oneShot: false,
      isTTY: true,
      getReadline: () => ({ question }),
      sessionConfirmations,
      globalConfirmations: new Set(),
      globalConfirmationPath: "unused.json",
    });
    await expect(
      confirmer({ call_id: "call", action: { commands: "echo hello" } }, "C:/repo"),
    ).resolves.toBe(true);
    expect(sessionConfirmations).toHaveProperty("size", 1);
  });

  test.each([
    [true, true],
    [false, false],
  ])("declines when one-shot is %s and TTY is %s", async (oneShot, isTTY) => {
    const state = makeConfirmer({ oneShot, isTTY });
    await expect(state.confirmer(call, "C:/work")).resolves.toBe(false);
    expect(state.question).not.toHaveBeenCalled();
  });
});
