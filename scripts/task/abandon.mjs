// Throwing a task away. This is the safety valve that keeps the workflow from
// ever being the reason work stalls: a task that went wrong is deleted whole
// and `dev` needs no cleaning, because nothing was ever merged into it.
//
// Commits that never reached the integration branch are lost, so a task that
// has any is refused unless --force says to discard them. The reflog still
// holds them for a while, but nothing about that is a promise.
//
// Abandoning the branch you are standing on is the ordinary case here, not an
// edge one -- Core has no worktree to abandon a task from the outside -- so
// this switches back to the integration branch first rather than letting git
// refuse to delete a checked-out branch. That is also why a dirty tree is
// refused in that case and only that case: the switch would carry the changes
// onto the integration branch, which is the one place this command must leave
// exactly as it found it.

import { dirtyLines } from "./dirty-lines.mjs";
import { runGit } from "./git-command.mjs";
import { branchCheckedOutElsewhere, locateTask } from "./locate.mjs";
import { noteTaskProgress } from "./progress-note.mjs";

export async function abandonTask({ repositoryRoot, id, integrationBranch = "dev", force = false, dryRun = false, note = noteTaskProgress }) {
  const task = await locateTask(repositoryRoot, id);
  if (task.checkedOutIn) {
    throw new Error(`${task.branch} is checked out in ${task.checkedOutIn}, so this checkout cannot delete it. Detach that worktree with "git -C ${task.checkedOutIn} checkout --detach" first.`);
  }

  const counted = await runGit(repositoryRoot, ["rev-list", "--count", `${integrationBranch}..${task.branch}`]);
  const unmerged = Number(counted.trim());
  if (unmerged > 0 && !force) {
    throw new Error(`${task.branch} has ${unmerged} commit(s) that never reached ${integrationBranch}. Abandoning discards them; pass --force if that is what you mean.`);
  }

  const head = (await runGit(repositoryRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const standingOnIt = head === task.branch;

  if (standingOnIt) {
    const elsewhere = await branchCheckedOutElsewhere(repositoryRoot, integrationBranch);
    if (elsewhere) {
      throw new Error(`This checkout is on ${task.branch}, and ${integrationBranch} is checked out in ${elsewhere}, so there is nowhere here to move to before the branch is deleted. Switch this checkout to another branch by hand, then abandon.`);
    }
    const dirty = await dirtyLines(repositoryRoot);
    if (dirty.length > 0) {
      throw new Error(`${repositoryRoot} is on ${task.branch} with ${dirty.length} uncommitted or untracked change(s) (${dirty.slice(0, 3).map((line) => line.trim()).join("; ")}). Leaving the branch would carry them onto ${integrationBranch}; commit, stash or discard them first.`);
    }
  }

  const leaves = standingOnIt ? integrationBranch : head;
  if (dryRun) return { id, branch: task.branch, unmerged, leaves, applied: false };

  if (standingOnIt) {
    note({ step: "checkout", branch: integrationBranch });
    await runGit(repositoryRoot, ["checkout", integrationBranch]);
  }

  note({ step: "delete", branch: task.branch, unmerged });
  await runGit(repositoryRoot, ["branch", "-D", task.branch]);

  return { id, branch: task.branch, unmerged, leaves, applied: true };
}
