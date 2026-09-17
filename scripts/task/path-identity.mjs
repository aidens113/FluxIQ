// Comparing paths the way this machine's file system does. git prints a
// worktree path with forward slashes and whatever case the directory was
// created with, while node builds one with backslashes from `path.join`, so two
// spellings of one directory must compare equal before a task command can tell
// "this checkout" from "some other worktree of the same repository".

import path from "node:path";

/** Whether `a` and `b` name the same directory. */
export function samePath(a, b) {
  const key = (value) => {
    const resolved = path.resolve(value).replace(/[\/]+$/u, "");
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return key(a) === key(b);
}
