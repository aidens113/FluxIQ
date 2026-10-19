// Running a package's contract tests with vitest, naming exactly the files and
// nothing else, so the gate costs one vitest start-up rather than a suite.
//
// Which files failed is read from vitest's JSON report, written to a temporary
// file so stdout and stderr stay the person's: the readable output goes to
// stderr, as `pnpm check`'s does. If vitest dies before it writes a report,
// every file is counted as failed -- an unreadable result is not a pass.
// `shell` is set on Windows because pnpm is a `.cmd` shim there.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { samePath } from "../path-identity.mjs";

/**
 * @param {string} packageRoot absolute package directory
 * @param {string[]} files test files relative to `packageRoot`
 * @returns {Promise<{ failed: string[] }>}
 */
export async function runContractTests(packageRoot, files) {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "core-contract-tests-"));
  const report = path.join(scratch, "report.json");
  try {
    const quote = (value) => (process.platform === "win32" && /\s/u.test(value) ? `"${value}"` : value);
    const args = ["exec", "vitest", "run", ...files, "--reporter=default", "--reporter=json", quote(`--outputFile.json=${report}`)];
    const code = await new Promise((resolve, reject) => {
      const child = spawn("pnpm", args, { cwd: packageRoot, stdio: ["ignore", 2, 2], shell: process.platform === "win32", windowsHide: true });
      child.once("error", reject);
      child.once("close", (exit, signal) => resolve(signal ?? exit));
    });

    let text;
    try {
      text = await readFile(report, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return { failed: [...files] };
      throw error;
    }
    const results = JSON.parse(text).testResults ?? [];

    const failed = files.filter((file) => {
      const result = results.find((entry) => samePath(entry.name, path.resolve(packageRoot, file)));
      return !result || result.status !== "passed";
    });
    // A non-zero exit with every file passing (an unhandled error, say) is
    // still a failure; name every file rather than none.
    return { failed: failed.length === 0 && code !== 0 ? [...files] : failed };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
