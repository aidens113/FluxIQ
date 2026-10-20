// Whether a `runGit` rejection is git answering "no" rather than git failing to
// run at all.
//
// Several questions are asked by running a command that exits non-zero for the
// answer we want: `symbolic-ref HEAD` on a detached checkout, `rev-parse` on a
// revision that does not exist, anything at all in a directory that is no
// checkout. Reading every rejection as that answer would also read a machine
// with no git on its PATH as "the Core is on no branch and behind nothing",
// which is the one mistake that matters: a check that cannot run must not
// report a clean result.
//
// `execFile` separates the two. A process that ran and exited non-zero gives a
// numeric `code`; one that could not be spawned gives a string errno (ENOENT,
// EACCES), and a killed one gives a `signal` and no code. Only the first is an
// answer. `git-command.mjs` keeps the `execFile` error as the rejection's
// `cause`, which is what this reads. The downstream web-extension repository
// imports this module for its worktree and Core-currency checks.

/** @param {unknown} error a rejection from `runGit` @returns {boolean} */
export function gitAnsweredNo(error) {
  return typeof error?.cause?.code === "number" && error.cause.code !== 0;
}
