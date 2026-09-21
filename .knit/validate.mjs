import { execFileSync } from "node:child_process";

execFileSync("git", ["pull", "--ff-only", "origin", "main"], { stdio: "inherit" });
execFileSync("npm", ["ci"], { stdio: "inherit" });
execFileSync("npm", ["test"], { stdio: "inherit" });
