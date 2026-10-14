import { describe, expect, jest, test } from "@jest/globals";
import { applySetupAction } from "../src/setup-action.mjs";

describe("setup actions", () => {
  test("routes each setting action and replaces readline for API edits", async () => {
    const readline = { close: jest.fn() };
    const nextReadline = {};
    const deps = {
      createInterface: jest.fn(() => nextReadline),
      editApiKey: jest.fn(async () => "saved"),
      editCompaction: jest.fn(),
      editValue: jest.fn(),
    };
    const context = {
      stdin: {},
      stdout: {},
      readlineInput: {},
      envState: {},
      readline,
      message: "old",
    };
    const api = await applySetupAction("api", context, deps);
    expect(api).toEqual({ readline: nextReadline, message: "saved" });
    for (const id of ["model", "mode", "effort", "summary", "verbosity"])
      await applySetupAction(id, context, deps);
    await applySetupAction("compaction", context, deps);
    expect(deps.editValue).toHaveBeenCalledTimes(5);
    expect(deps.editCompaction).toHaveBeenCalledTimes(1);
    expect(await applySetupAction("unknown", context, deps)).toEqual({ readline, message: "old" });
  });
});
