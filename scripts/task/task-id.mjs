// Which number a task gets, and whether a number it was handed is still free.
//
// An id must not collide with work that is still open or with work whose merge
// is already history, so both are scanned: open work is a `task/t<NNN>-`
// branch, finished work is the subject of its `--no-ff` merge commit. History
// is scanned rather than a counter stored, because a counter in a tracked file
// is itself a merge conflict between two tasks allocated at the same time, and
// a counter in ignored space does not survive a fresh clone.
//
// `requested` is the cross-repository seam and the reason this file differs
// from the downstream one. A task that spans FluxIQ Core and the web-extension
// repository is ONE unit of work and must read as one in both histories, so the
// id is allocated once -- downstream, where such a task always starts, because
// the extension side owns the worktree layout -- and passed here with `--id`.
// Allocating independently would give the same work two numbers, and
// `git revert -m 1` on one side would then name a task the other side has never
// heard of.
//
// Numbers are compared as numbers, not as strings, so "t0042" cannot slip past
// "t042"; the spelling is then pinned to the canonical form as well, so an id
// that names one unit of work is also written one way in both repositories.

import { runGit } from "./git-command.mjs";

const ID = /^t(\d{3,})$/u;
const OPEN = /^task\/t(\d+)-/u;
const MERGED = /^Merge task t(\d+):/u;

const canonical = (number) => `t${String(number).padStart(3, "0")}`;

/**
 * The pure decision, separated from the scan so it can be tested without a
 * repository: given what is already used, either honour a requested id or take
 * the next free one.
 *
 * @param {{ used: { number: number, where: string }[], requested?: string }} input
 * @returns {string}
 */
export function chooseTaskId({ used, requested }) {
  if (requested === undefined) {
    const next = used.length === 0 ? 1 : Math.max(...used.map((entry) => entry.number)) + 1;
    return canonical(next);
  }

  const match = ID.exec(requested);
  if (!match) throw new Error(`"${requested}" is not a task id: an id is the letter t and at least three digits, for example "t042".`);

  const number = Number(match[1]);
  if (canonical(number) !== requested) {
    throw new Error(`Task ${requested} is written differently here and downstream, which defeats the point of sharing an id: write it ${canonical(number)}.`);
  }

  const taken = used.find((entry) => entry.number === number);
  if (taken) throw new Error(`Task ${requested} is taken by ${taken.where}. A shared id names one unit of work; allocate a new one downstream and pass that.`);

  return requested;
}

/**
 * @param {{ repositoryRoot: string, integrationBranch?: string, requested?: string }} input
 * @returns {Promise<string>}
 */
export async function allocateTaskId({ repositoryRoot, integrationBranch = "dev", requested }) {
  const branches = await runGit(repositoryRoot, ["branch", "--list", "--format=%(refname:short)", "task/*"]);
  const subjects = await runGit(repositoryRoot, ["log", "--first-parent", "--format=%s", integrationBranch]);

  const used = [
    ...lines(branches).map((line) => match(OPEN, line, (number) => ({ number, where: `the open branch ${line}` }))),
    ...lines(subjects).map((line) => match(MERGED, line, (number) => ({ number, where: `the merge already in ${integrationBranch}: "${line}"` })))
  ].filter((entry) => entry !== null);

  return chooseTaskId({ used, requested });
}

const lines = (stdout) => stdout.split("\n").map((line) => line.trim()).filter(Boolean);

function match(pattern, line, build) {
  const found = pattern.exec(line);
  return found ? build(Number(found[1])) : null;
}
