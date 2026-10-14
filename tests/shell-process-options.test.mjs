import { expect, test } from "@jest/globals";
import { createShellSpawnOptions } from "../src/shell-process-options.mjs";

test("configures hidden shell child pipes", () => {
  expect(createShellSpawnOptions("/workspace", "linux")).toMatchObject({
    cwd: "/workspace",
    windowsHide: true,
    detached: true,
  });
});
