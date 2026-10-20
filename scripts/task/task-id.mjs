// Which number a task gets, and whether a number it was handed is still free.
//
// An id must not collide with work that is still open or with work whose merge
// is already history, so both are scanned: open work is a `task/t<NNN>-`
// branch, finished work is the subject of its `--no-ff` merge commit. History
// is scanned rather than a counter stored, because a counter in a tracked file
// is itself a merge conflict between two tasks allocated at the same time, and
// a counter in ignored space does not survive a fresh clone.
//
// This is the one allocator both repositories use: the downstream
// web-extension repository imports this module rather than keeping a copy, so
// the rule cannot drift between the two (two copies once said "keep the two in
// step" and nothing checked it).
//
// A task that spans FluxIQ Core and the web-extension repository is ONE unit of
// work and must read as one in both histories, so the id is allocated once --
// downstream, where such a task always starts, because the extension side owns
// the worktree layout -- against both repositories at once: downstream passes
// Core as one of `pairedRepositories`, every repository is scanned and the
// highest number wins. An id free downstream but already spent in Core would
// put two different tasks under one number in Core's own log (on 2026-09-24
// downstream's next free id was t122 while Core had already merged its own t122
// and t123). Core's own start is then handed that id with `--id` (`requested`);
// allocating independently would give the same work two numbers, and
// `git revert -m 1` on one side would then name a task the other side has never
// heard of.
//
// Numbers are compared as numbers, not as strings, so "t0042" cannot slip past
// "t042"; the spelling is then pinned to the canonical form as well, so an id
// that names one unit of work is also written one way in both repositories.
//
// Branches and merges alone forget an abandoned task: its branch is deleted
// and it never merged, so its number was handed out again (downstream, t574,
// t598 and t616 each came to name two units of work). So every start records
// its id as a local ref, `refs/fluxiq/task-ids/t<NNN>`, at the commit it
// started from, in each repository it was allocated against
// (`record-task-id.mjs`), and those refs count as used. A ref cannot conflict
// between two tasks, survives branch deletion, abandon and prune, and costs
// nothing. `Task: t<NNN>` trailers on any local branch count as well, which
// covers ids spent before the refs existed. A fresh clone has neither, and
// still clears every merged id from history exactly as before.

import { runGit } from "./git-command.mjs";
import { TASK_ID_REF_PREFIX } from "./task-id-ref-prefix.mjs";

const ID = /^t(\d{3,})$/u;
const OPEN = /^task\/t(\d+)-/u;
const MERGED = /^Merge task t(\d+):/u;
const RECORDED = /^refs\/fluxiq\/task-ids\/t(\d+)$/u;
const TRAILER = /^t(\d+)$/u;

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
 * @param {{
 *   repositoryRoot: string,
 *   integrationBranch?: string,
 *   requested?: string,
 *   pairedRepositories?: { repositoryRoot: string, integrationBranch?: string }[]
 * }} input `pairedRepositories` are the other repositories one unit of work
 *   spans; an id spent in any of them is used.
 * @returns {Promise<string>}
 */
export async function allocateTaskId({ repositoryRoot, integrationBranch = "dev", requested, pairedRepositories = [] }) {
  const scans = [
    usedIds(repositoryRoot, integrationBranch, ""),
    ...pairedRepositories.map((paired) => usedIds(paired.repositoryRoot, paired.integrationBranch ?? "dev", ` in ${paired.repositoryRoot}`))
  ];
  const used = (await Promise.all(scans)).flat();
  return chooseTaskId({ used, requested });
}

async function usedIds(root, integrationBranch, suffix) {
  const branches = await runGit(root, ["branch", "--list", "--format=%(refname:short)", "task/*"]);
  const subjects = await runGit(root, ["log", "--first-parent", "--format=%s", integrationBranch]);
  const recorded = await runGit(root, ["for-each-ref", "--format=%(refname)", TASK_ID_REF_PREFIX]);
  const trailers = await runGit(root, ["log", "--branches", "--format=%(trailers:key=Task,valueonly)"]);

  return [
    ...lines(branches).map((line) => match(OPEN, line, (number) => ({ number, where: `the open branch ${line}${suffix}` }))),
    ...lines(subjects).map((line) => match(MERGED, line, (number) => ({ number, where: `the merge already in ${integrationBranch}${suffix}: "${line}"` }))),
    ...lines(recorded).map((line) => match(RECORDED, line, (number) => ({ number, where: `the earlier allocation recorded as ${line}${suffix}` }))),
    ...lines(trailers).map((line) => match(TRAILER, line, (number) => ({ number, where: `a "Task: ${line}" trailer on a local branch${suffix}` })))
  ].filter((entry) => entry !== null);
}

const lines = (stdout) => stdout.split("\n").map((line) => line.trim()).filter(Boolean);

function match(pattern, line, build) {
  const found = pattern.exec(line);
  return found ? build(Number(found[1])) : null;
}
