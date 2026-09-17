// What is uncommitted or untracked in one checkout, as the porcelain lines
// themselves rather than a count, so a refusal can name the files it is
// refusing over.
//
// Untracked files are included deliberately. A task merges what is in its
// history; a new file nobody staged is invisible to the merge and would be
// left sitting in the tree after the branch that was meant to carry it is
// deleted.

import { runGit } from "./git-command.mjs";

/** @param {string} root @returns {Promise<string[]>} */
export async function dirtyLines(root) {
  const status = await runGit(root, ["status", "--porcelain=v1", "--untracked-files=normal"]);
  return status.split(/\r?\n/u).filter((line) => line.trim() !== "");
}
