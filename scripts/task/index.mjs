// The task lifecycle: opening a unit of work on its own branch and closing it
// with a merge boundary that can be reverted whole. Core runs the branch half
// of the workflow; the worktree half lives in the downstream web-extension
// repository, whose `domain` link is what fixes where a Core worktree sits.

export { abandonTask } from "./abandon.mjs";
export { parseTaskArguments } from "./arguments.mjs";
export { parseTaskBranch, taskBranchName } from "./branch-name.mjs";
export { runCheck } from "./check-command.mjs";
export { runTaskCommandLine } from "./command-line.mjs";
export { dirtyLines } from "./dirty-lines.mjs";
export { finishTask } from "./finish.mjs";
export { runGit } from "./git-command.mjs";
export { listTasks } from "./list.mjs";
export { branchCheckedOutElsewhere, listWorktrees, locateTask } from "./locate.mjs";
export { samePath } from "./path-identity.mjs";
export { noteTaskProgress } from "./progress-note.mjs";
export { startTask } from "./start.mjs";
export { allocateTaskId, chooseTaskId } from "./task-id.mjs";
