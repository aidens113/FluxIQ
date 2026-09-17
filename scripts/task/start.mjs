// Opening a task: one branch off the integration branch, in the checkout you
// are already in.
//
// Core takes the branch and nothing else. The downstream web-extension
// repository can also open a task in a worktree of its own, because
// `domain/package.json` links Core as `link:../../!FluxIQ/packages/fluxiq` and
// a worktree therefore needs a Core sitting beside it -- which that repository's
// tooling creates, out of this one, detached. The provisioning is downstream's
// precisely because the layout is downstream's requirement, and duplicating it
// here would give two repositories two opinions about where a Core worktree
// lives. So there is no --worktree here, and no escape hatch for a dirty tree
// either: a task branch opened over uncommitted work would carry it into the
// merge, or strand it when the branch is deleted.
//
// Every refusal is decided before anything changes, so a rejected start leaves
// no half-made branch behind.

import { taskBranchName } from "./branch-name.mjs";
import { dirtyLines } from "./dirty-lines.mjs";
import { runGit } from "./git-command.mjs";
import { noteTaskProgress } from "./progress-note.mjs";
import { allocateTaskId } from "./task-id.mjs";

export async function startTask({ repositoryRoot, slug, id: requested, from = "dev", dryRun = false, note = noteTaskProgress }) {
  if (!slug) throw new Error('Name the work: pnpm task start <slug>, for example "automation-studio-cleanup".');

  const startPoint = await runGit(repositoryRoot, ["rev-parse", "--verify", "--quiet", `${from}^{commit}`]).catch((cause) => {
    throw new Error(`${JSON.stringify(from)} does not name a commit in ${repositoryRoot}, so a task cannot branch off it.`, { cause });
  });

  const id = await allocateTaskId({ repositoryRoot, integrationBranch: from, requested });
  const branch = taskBranchName(id, slug);

  const existing = await runGit(repositoryRoot, ["branch", "--list", "--format=%(refname:short)", branch]);
  if (existing.trim()) throw new Error(`${branch} already exists.`);

  const dirty = await dirtyLines(repositoryRoot);
  if (dirty.length > 0) {
    throw new Error(`${repositoryRoot} has ${dirty.length} uncommitted or untracked change(s) (${dirty.slice(0, 3).map((line) => line.trim()).join("; ")}); commit, stash or discard them before opening a task branch. This checkout is the only place a Core task runs.`);
  }

  if (dryRun) return { id, branch, from, startPoint, allocated: requested === undefined, applied: false };

  note({ step: "branch", branch, from, startPoint });
  await runGit(repositoryRoot, ["checkout", "-b", branch, from]);

  return { id, branch, from, startPoint, allocated: requested === undefined, applied: true };
}
