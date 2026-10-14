import { expect, test } from "@jest/globals";
import {
  compactTranscriptJson,
  shellOutputPreview,
} from "../src/response-transcript-compaction.mjs";

test("redacts sensitive data and bounds large transcript values", () => {
  const result = compactTranscriptJson({
    encrypted_content: "secret",
    result: "x".repeat(501),
    output: [{ stdout: "x".repeat(150), stderr: "y".repeat(150) }, null, "plain", {}],
  });
  expect(result).toContain("[encrypted reasoning omitted]");
  expect(result).toContain("[large result omitted: 501 chars]");
  expect(result).toContain("x".repeat(120));
  expect(result).not.toContain("x".repeat(121));
  expect(result).toContain('null,"plain",{"stdout":"","stderr":""}');
  expect(compactTranscriptJson({ result: "small", output: "plain" })).toBe(
    '{"result":"small","output":"plain"}',
  );
});

test("bounds shell previews and keeps outcome details", () => {
  expect(
    shellOutputPreview({
      output: [{ stdout: "x".repeat(200), stderr: "y".repeat(200), outcome: { exit_code: 0 } }],
    }),
  ).toEqual([
    {
      stdout: "x".repeat(120),
      stderr: "y".repeat(120),
      outcome: { exit_code: 0 },
    },
  ]);
  expect(shellOutputPreview({})).toEqual([]);
  expect(shellOutputPreview({ output: [null] })).toEqual([
    { stdout: "", stderr: "", outcome: null },
  ]);
});
