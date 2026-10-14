import { expect, test } from "@jest/globals";
import { mkdtempSync, symlinkSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectInvocation } from "../src/entrypoint-invocation.mjs";

test("detects direct invocation and package launcher paths", () => {
  const originalArgv1 = process.argv[1];
  const entrypoint = new URL("../src/agent-entrypoint.mjs", import.meta.url);
  const launcher = new URL("../bin/agentx.mjs", import.meta.url);
  try {
    expect(typeof isDirectInvocation()).toBe("boolean");
    process.argv[1] = fileURLToPath(entrypoint);
    expect(isDirectInvocation(entrypoint.href)).toBe(true);
    process.argv[1] = fileURLToPath(launcher);
    expect(isDirectInvocation(entrypoint.href)).toBe(true);
  } finally {
    process.argv[1] = originalArgv1;
  }
});

test("detects symlink launchers on POSIX", () => {
  if (process.platform === "win32") return;
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentx-link-"));
  const link = path.join(directory, "agentx");
  const moduleUrl = new URL("../src/agent-entrypoint.mjs", import.meta.url);
  const originalArgv1 = process.argv[1];
  try {
    symlinkSync(fileURLToPath(moduleUrl), link);
    process.argv[1] = link;
    expect(isDirectInvocation(moduleUrl.href)).toBe(true);
  } finally {
    process.argv[1] = originalArgv1;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("returns false when the launcher path is missing", () => {
  const originalArgv1 = process.argv[1];
  try {
    process.argv[1] = undefined;
    expect(isDirectInvocation()).toBe(false);
    process.argv[1] = path.join(os.tmpdir(), "missing-agentx-launcher");
    expect(isDirectInvocation(new URL("../src/agent-entrypoint.mjs", import.meta.url).href)).toBe(
      false,
    );
  } finally {
    process.argv[1] = originalArgv1;
  }
});
