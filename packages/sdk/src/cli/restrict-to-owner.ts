// Makes a key file or folder the owner's alone. POSIX uses the mode; Windows cannot
// express this with chmod, so it removes inherited access and grants the user only,
// as the keys design says.

import { execFileSync } from "node:child_process";
import { chmodSync } from "node:fs";
import { userInfo } from "node:os";

/** Restricts `target`. Returns a warning when it could not be done, `undefined` when it was. */
export function restrictToOwner(target: string, kind: "file" | "directory"): string | undefined {
  if (process.platform !== "win32") {
    chmodSync(target, kind === "file" ? 0o600 : 0o700);
    return undefined;
  }
  try {
    execFileSync("icacls", [target, "/inheritance:r", "/grant:r", `${userInfo().username}:${kind === "file" ? "F" : "(OI)(CI)F"}`], { stdio: "ignore" });
    return undefined;
  } catch (error) {
    return `Could not restrict ${target} to your user (icacls failed: ${error instanceof Error ? error.message : "unknown"}). Check who can read it.`;
  }
}
