import { describe, expect, jest, test } from "@jest/globals";
import { path } from "@eliware/common";
import { loadEntrypointEnvironment } from "../src/agent-entrypoint-env.mjs";

describe("agent entrypoint environment", () => {
  test("loads the user config and returns its home path", () => {
    const load = jest.fn();
    expect(loadEntrypointEnvironment({ homeDirectory: "user-home", load })).toBe("user-home");
    expect(load).toHaveBeenCalledWith(path("user-home", ".agentx"));
  });

  test("returns no home path when the system has none", () => {
    expect(loadEntrypointEnvironment({ homeDirectory: "" })).toBe("");
  });
});
