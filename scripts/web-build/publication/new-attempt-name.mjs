// A fresh attempt directory name: random, so no two attempts ever share a
// directory, and short, so Windows build paths stay well inside their limit.

import { randomBytes } from "node:crypto";

/** @returns {string} */
export function newBuildAttemptName() {
  return `b-${randomBytes(6).toString("hex")}`;
}
