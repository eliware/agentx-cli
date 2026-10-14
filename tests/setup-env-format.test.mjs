import { describe, expect, test } from "@jest/globals";
import {
  configVersion,
  decodeEnvValue,
  knownSetupKeys,
  parseEnvLines,
  serializeEnvValue,
  updateEnvText,
} from "../src/setup-env-format.mjs";

describe("setup environment formatting", () => {
  test("reads configuration values and known keys", () => {
    expect(decodeEnvValue('"hello"')).toBe("hello");
    expect(decodeEnvValue('"bad')).toBe('"bad');
    expect(decodeEnvValue("plain")).toBe("plain");
    expect(knownSetupKeys().has("AGENTX_MODEL")).toBe(true);
    expect(configVersion()).toEqual({ key: "AGENTX_CONFIG_VERSION", current: "2" });
    expect(parseEnvLines("A=1\n# note")).toEqual([
      { type: "pair", key: "A", value: "1", line: "A=1" },
      { type: "raw", line: "# note" },
    ]);
    expect(decodeEnvValue()).toBe("");
    expect(parseEnvLines()[0]).toEqual({ type: "raw", line: "" });
  });

  test("quotes unsafe values and updates duplicate keys once", () => {
    expect(serializeEnvValue("plain-1")).toBe("plain-1");
    expect(serializeEnvValue('two words "ok"')).toBe('"two words \\"ok\\""');
    expect(updateEnvText("A=old\nA=duplicate\n", { A: "new", B: "two words" })).toBe(
      'A=new\n\nB="two words"\n',
    );
    expect(updateEnvText("A=1\n", {})).toBe("A=1\n");
    expect(updateEnvText("", {})).toBe("");
  });
});
