import stripAnsi from "strip-ansi";

export function normalizeStatusValue(value) {
  if (value && typeof value === "object" && "value" in value) return String(value.value ?? "");
  if (typeof value !== "string") return String(value ?? "");
  return stripAnsi(value.replace(/^([a-z]+):\s+/, ""));
}
