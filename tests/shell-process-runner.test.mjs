import { expect, test } from "@jest/globals";
import { runShellProcess } from "../src/shell-process-runner.mjs";

test("returns a clear result for an empty command", async () => {
  await expect(runShellProcess({}, " ", "/workspace", {})).resolves.toMatchObject({
    outcome: { type: "exit", exit_code: 2 },
  });
});
