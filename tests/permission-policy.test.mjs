import { expect, test } from "@jest/globals";
import { permissionAllowsRequired } from "../src/permission-policy.mjs";

test.each([
  ["read", "read", true],
  ["read", "write", false],
  ["write", "write", true],
  ["write", "execute", false],
  ["execute", "execute", true],
  ["invalid", "read", true],
])("allows %s permission for %s operation: %s", (level, required, allowed) => {
  expect(permissionAllowsRequired(level, required)).toBe(allowed);
});
