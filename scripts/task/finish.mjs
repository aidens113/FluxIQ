// Closing a task: integrate, validate, merge, delete.
//
// The integration step is the one that earns its keep. Two tasks can change
// different files, merge without a single conflict, and still leave the system
// incompatible -- git has no way to see that. Merging the integration branch
// into the task branch and re-running the checks there is what surfaces it,
// before `dev` is touched rather than after.
//
// The merge is always `--no-ff`, so the task keeps a boundary in history:
// first-parent history reads as a list of tasks, and `git revert -m 1` undoes
// one whole task cleanly. Commits are never squashed, because they are the
// step-by-step record of how the work went.
//
// Core is checked out more than once on this machine, and git will not let two
// worktrees stand on one branch. The gates (the integration merge, the contract
// tests, `pnpm check`) therefore run where the task branch already is: in its
// own worktree when it has one, like the extension's finish does, so the main
// checkout is not touched until every gate has passed and only the final
// `merge --no-ff` lands on the integration branch. That task worktree is then
// detached, so the branch can be deleted. With no task worktree the main
// checkout switches to the task branch for the gates, and on any gate failure
// it is switched back to the integration branch, so it is never left on task
// code that downstream builds would compile against; the task branch keeps its
// integration merge for the retry. An integration branch held by another
// worktree is refused up front: it cannot be merged into from here.
//
// Validation is two steps. The contract tests (`contract/list.mjs`) run first
// and always, because they are fast and pin model-facing text that a change in
// one place breaks far away; `pnpm check` follows unless --skip-checks.

import { runCheck } from "./check-command.mjs";
import { contractGate, runContractTests } from "./contract/index.mjs";
import { deleteMergedBranch } from "./delete-merged-branch.mjs";
import { dirtyLines } from "./dirty-lines.mjs";
import { runGit } from "./git-command.mjs";
import { branchCheckedOutElsewhere, locateTask } from "./locate.mjs";
import { noteTaskProgress } from "./progress-note.mjs";

export async function finishTask({ repositoryRoot, id, integrationBranch = "dev", skipChecks = false, dryRun = false, title, note = noteTaskProgress, check = runCheck, contractTests = runContractTests }) {
  const task = await locateTask(repositoryRoot, id);
  const workRoot = task.checkedOutIn ?? repositoryRoot;

  const elsewhere = await branchCheckedOutElsewhere(repositoryRoot, integrationBranch);
  if (elsewhere) {
    throw new Error(`${integrationBranch} is checked out in ${elsewhere}, not in ${repositoryRoot}, so this checkout cannot merge into it. Run finish in ${elsewhere}.`);
  }

  const dirty = [...await dirtyLines(repositoryRoot), ...(workRoot === repositoryRoot ? [] : await dirtyLines(workRoot))];
  if (dirty.length > 0) {
    throw new Error(`${repositoryRoot} or ${workRoot} has ${dirty.length} uncommitted or untracked change(s) (${dirty.slice(0, 3).map((line) => line.trim()).join("; ")}). Commit or discard them: a task merges what is in its history, never what is lying in its tree.`);
  }

  const head = (await runGit(repositoryRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const subject = `Merge task ${id}: ${title ?? task.slug ?? task.branch}`;

  if (dryRun) {
    const planned = { ran: false, command: skipChecks ? null : "pnpm check", reason: skipChecks ? "--skip-checks" : "--dry-run" };
    const contracts = await contractGate({ repositoryRoot, branch: task.branch, dryRun: true });
    return { id, branch: task.branch, into: integrationBranch, head, merge: subject, contracts, validation: planned, applied: false };
  }

  const inMain = workRoot === repositoryRoot;
  if (inMain && head !== task.branch) {
    note({ step: "checkout", branch: task.branch });
    await runGit(repositoryRoot, ["checkout", task.branch]);
  }

  let contracts;
  let validation;
  try {
    note({ step: "integrate", into: task.branch, from: integrationBranch, root: workRoot });
    await runGit(workRoot, ["merge", "--no-edit", integrationBranch]);

    contracts = await contractGate({ repositoryRoot: workRoot, branch: task.branch, note, run: contractTests });

    validation = skipChecks
      ? { ran: false, command: null, reason: "--skip-checks" }
      : await validate({ repositoryRoot: workRoot, branch: task.branch, note, check });
  } catch (error) {
    if (inMain) await returnToIntegration({ repositoryRoot, branch: task.branch, integrationBranch, head, note });
    throw error;
  }

  if (head !== integrationBranch || inMain) {
    note({ step: "checkout", branch: integrationBranch });
    await runGit(repositoryRoot, ["checkout", integrationBranch]);
  }

  note({ step: "merge", subject });
  await runGit(repositoryRoot, ["merge", "--no-ff", "-m", subject, task.branch]);

  if (!inMain) {
    note({ step: "detach", root: workRoot });
    await runGit(workRoot, ["checkout", "--detach"]);
  }

  note({ step: "delete", branch: task.branch });
  await deleteMergedBranch({ repositoryRoot, branch: task.branch, integrationBranch });

  return { id, branch: task.branch, into: integrationBranch, head, merge: subject, contracts, validation, applied: true };
}

// A failed gate in the main checkout puts it back on the integration branch
// (or on the branch it started on), never on the task branch. A conflicted
// integration merge is aborted first, or the checkout itself would refuse.
async function returnToIntegration({ repositoryRoot, branch, integrationBranch, head, note }) {
  await runGit(repositoryRoot, ["merge", "--abort"]).catch(/* best-effort: no merge may be in progress */ () => undefined);
  const target = head === branch ? integrationBranch : head;
  note({ step: "checkout", branch: target });
  await runGit(repositoryRoot, ["checkout", target]);
}

async function validate({ repositoryRoot, branch, note, check }) {
  note({ step: "check", command: "pnpm check", root: repositoryRoot });
  try {
    await check(repositoryRoot);
  } catch (cause) {
    throw new Error(`"pnpm check" failed in ${repositoryRoot}, so task ${branch} was not merged. ${branch} keeps the integration merge and the main checkout is back on its own branch, so fix it, commit, and run finish again -- or pass --skip-checks if the failure is known and unrelated.`, { cause });
  }
  return { ran: true, command: "pnpm check", passed: true };
}
