// Running git against one checkout. Output is returned with only its trailing
// newline removed: a porcelain status line can begin with a space, and trimming
// it would turn a modified file into an unreadable one.

import { execFile } from "node:child_process";

/** @param {string} root @param {string[]} args @returns {Promise<string>} */
export function runGit(root, args) {
  return new Promise((resolve, reject) => {
    execFile("git", ["-C", root, ...args], { windowsHide: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`git ${args.join(" ")} in ${root} failed: ${(stderr || error.message).trim()}`, { cause: error }));
      else resolve(stdout.replace(/\r?\n$/u, ""));
    });
  });
}
