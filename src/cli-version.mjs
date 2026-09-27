import { readFileSync } from "node:fs";
import { path } from "@eliware/common";

const packagePath = path(import.meta, "..", "package.json");

export function getPackageVersion() {
  const raw = readFileSync(packagePath, "utf8");
  return JSON.parse(raw).version || "unknown";
}
