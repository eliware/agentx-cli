import { expect, test } from "@jest/globals";
import { getRollbackMenuLines } from "../src/rollback-menu-view.mjs";

test("formats checkpoint rows and a cancel row", () => {
  const rows = getRollbackMenuLines(
    [{ timestamp: "not-a-date", user_preview: " a\n b ", assistant_preview: "x".repeat(25) }],
    1,
  );
  expect(rows[2]).toContain('" a b "');
  expect(rows[2]).toContain(`"${"x".repeat(20)}"`);
  expect(rows[3]).toContain("> 2. Cancel");
  expect(rows[2]).toContain("Invalid Date");
});

test("uses an unknown time and empty previews when metadata is missing", () => {
  const rows = getRollbackMenuLines([{}], 0);
  expect(rows[2]).toContain("unknown time");
  expect(rows[2]).toContain('""  ->  ""');
  expect(rows[2].startsWith("> 1.")).toBe(true);
});
