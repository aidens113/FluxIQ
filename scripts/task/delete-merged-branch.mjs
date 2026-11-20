// Deleting a task branch once its work is on the integration branch.
//
// `git branch -d` judges "merged" against the branch's upstream when it has one,
// so a branch that was pushed before the integration merge landed on it is
// refused even though every commit is in `dev`. The question that matters is
// whether `dev` contains the branch, so it is asked directly, and only a "yes"
// allows the forced delete. A "no" refuses: `-D` on an unmerged branch would
// throw work away. Local deletion only; remote branches are the lead's call.

import { gitAnsweredNo } from "./git-answered-no.mjs";
import { runGit } from "./git-command.mjs";

export async function deleteMergedBranch({ repositoryRoot, branch, integrationBranch }) {
  try {
    await runGit(repositoryRoot, ["merge-base", "--is-ancestor", branch, integrationBranch]);
  } catch (cause) {
    if (!gitAnsweredNo(cause)) throw cause;
    throw new Error(`${branch} was not deleted: ${integrationBranch} does not contain all of its commits, so deleting it would lose work. Inspect it with "git log ${integrationBranch}..${branch}".`, { cause });
  }
  await runGit(repositoryRoot, ["branch", "-D", branch]);
}
