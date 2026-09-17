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
// Both refusals at the top are about Core being checked out more than once on
// this machine. git will not let two worktrees stand on one branch, so a task
// branch held elsewhere cannot be merged or deleted from here, and an
// integration branch held elsewhere cannot be switched to from here. Either one
// discovered halfway would leave the task branch carrying an integration merge
// with nothing done about it.

import { runCheck } from "./check-command.mjs";
import { dirtyLines } from "./dirty-lines.mjs";
import { runGit } from "./git-command.mjs";
import { branchCheckedOutElsewhere, locateTask } from "./locate.mjs";
import { noteTaskProgress } from "./progress-note.mjs";

export async function finishTask({ repositoryRoot, id, integrationBranch = "dev", skipChecks = false, dryRun = false, title, note = noteTaskProgress, check = runCheck }) {
  const task = await locateTask(repositoryRoot, id);
  if (task.checkedOutIn) {
    throw new Error(`${task.branch} is checked out in ${task.checkedOutIn}, so this checkout cannot merge or delete it. Detach that worktree with "git -C ${task.checkedOutIn} checkout --detach", then finish from the checkout that holds ${integrationBranch}.`);
  }

  const elsewhere = await branchCheckedOutElsewhere(repositoryRoot, integrationBranch);
  if (elsewhere) {
    throw new Error(`${integrationBranch} is checked out in ${elsewhere}, not in ${repositoryRoot}, so this checkout cannot merge into it. Run finish in ${elsewhere}.`);
  }

  const dirty = await dirtyLines(repositoryRoot);
  if (dirty.length > 0) {
    throw new Error(`${repositoryRoot} has ${dirty.length} uncommitted or untracked change(s) (${dirty.slice(0, 3).map((line) => line.trim()).join("; ")}). Commit or discard them: a task merges what is in its history, never what is lying in its tree.`);
  }

  const head = (await runGit(repositoryRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const subject = `Merge task ${id}: ${title ?? task.slug ?? task.branch}`;

  if (dryRun) {
    const planned = { ran: false, command: skipChecks ? null : "pnpm check", reason: skipChecks ? "--skip-checks" : "--dry-run" };
    return { id, branch: task.branch, into: integrationBranch, head, merge: subject, validation: planned, applied: false };
  }

  if (head !== task.branch) {
    note({ step: "checkout", branch: task.branch });
    await runGit(repositoryRoot, ["checkout", task.branch]);
  }

  note({ step: "integrate", into: task.branch, from: integrationBranch });
  await runGit(repositoryRoot, ["merge", "--no-edit", integrationBranch]);

  const validation = skipChecks
    ? { ran: false, command: null, reason: "--skip-checks" }
    : await validate({ repositoryRoot, branch: task.branch, note, check });

  note({ step: "checkout", branch: integrationBranch });
  await runGit(repositoryRoot, ["checkout", integrationBranch]);

  note({ step: "merge", subject });
  await runGit(repositoryRoot, ["merge", "--no-ff", "-m", subject, task.branch]);

  note({ step: "delete", branch: task.branch });
  await runGit(repositoryRoot, ["branch", "-d", task.branch]);

  return { id, branch: task.branch, into: integrationBranch, head, merge: subject, validation, applied: true };
}

async function validate({ repositoryRoot, branch, note, check }) {
  note({ step: "check", command: "pnpm check", root: repositoryRoot });
  try {
    await check(repositoryRoot);
  } catch (cause) {
    throw new Error(`"pnpm check" failed in ${repositoryRoot}, so task ${branch} was not merged. The checkout is left on ${branch}, which now carries the integration merge, so fix it, commit, and run finish again -- or pass --skip-checks if the failure is known and unrelated.`, { cause });
  }
  return { ran: true, command: "pnpm check", passed: true };
}
