// Finding a task by its id: the branch that carries it, and whether some other
// worktree of this repository has that branch checked out. Both are read from
// git rather than from any record this tooling keeps, so a branch created or
// deleted by hand is still seen.
//
// The second question matters here in a way it does not in a repository with
// one checkout. Core is checked out several times on this machine -- the Lab
// pins worktrees under F:/fxlab, and a Core-paired task's tooling adds a Core
// sibling beside the extension worktree -- and all of those are created
// detached on purpose. A task branch checked out in one of them is therefore
// something an agent did there, and it stops this checkout from merging or
// deleting the branch: git refuses to move or remove a ref another worktree is
// standing on. Saying so before anything is touched beats failing halfway
// through a merge.

import { runGit } from "./git-command.mjs";
import { parseTaskBranch } from "./branch-name.mjs";
import { samePath } from "./path-identity.mjs";

export async function listWorktrees(repositoryRoot) {
  const stdout = await runGit(repositoryRoot, ["worktree", "list", "--porcelain"]);
  const worktrees = [];
  let current = null;

  for (const line of stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { root: line.slice("worktree ".length).trim(), branch: null, detached: false };
      worktrees.push(current);
    } else if (line.startsWith("branch ") && current) {
      current.branch = line.slice("branch refs/heads/".length).trim();
    } else if (line.trim() === "detached" && current) {
      current.detached = true;
    }
  }

  return worktrees;
}

/** Where `branch` is checked out other than `repositoryRoot`, or null. */
export async function branchCheckedOutElsewhere(repositoryRoot, branch) {
  const worktrees = await listWorktrees(repositoryRoot);
  return worktrees.find((entry) => entry.branch === branch && !samePath(entry.root, repositoryRoot))?.root ?? null;
}

export async function locateTask(repositoryRoot, id) {
  const stdout = await runGit(repositoryRoot, ["branch", "--list", "--format=%(refname:short)", `task/${id}-*`]);
  const branches = stdout.split("\n").map((line) => line.trim()).filter(Boolean);

  if (branches.length === 0) throw new Error(`No branch for task ${id}. Open tasks are listed by "pnpm task list".`);
  if (branches.length > 1) throw new Error(`Task ${id} has ${branches.length} branches (${branches.join(", ")}); an id names one unit of work, so resolve this by hand.`);

  const branch = branches[0];
  return {
    id,
    branch,
    slug: parseTaskBranch(branch)?.slug ?? null,
    checkedOutIn: await branchCheckedOutElsewhere(repositoryRoot, branch)
  };
}
