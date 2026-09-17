// Running Core's own `pnpm check` over a task branch before it is merged.
//
// Its output goes to stderr so the calling script's stdout holds only the
// result a caller reads. The environment is inherited unchanged, because the
// point of this step is to validate exactly what a person typing `pnpm check`
// in this checkout would get: nothing is installed and nothing leaves the
// machine, so trimming the environment here would only make the gate differ
// from the one it is standing in for. `shell` is set on Windows because pnpm is
// a `.cmd` shim there, which `spawn` cannot start on its own.

import { spawn } from "node:child_process";

/** @param {string} root @returns {Promise<void>} */
export function runCheck(root) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["check"], { cwd: root, stdio: ["ignore", 2, 2], shell: process.platform === "win32", windowsHide: true });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`"pnpm check" in ${root} exited with ${signal ?? code}`));
    });
  });
}
