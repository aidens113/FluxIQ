// The task lifecycle: opening a unit of work on its own branch and closing it
// with a merge boundary that can be reverted whole. Core runs the branch half
// of the workflow; the worktree half lives in the downstream web-extension
// repository, whose `domain` link is what fixes where a Core worktree sits.
// The rules both halves share -- id allocation and its refs, branch naming,
// the git runner, path identity -- are owned here, and the downstream
// repository imports those modules by path rather than keeping copies.

export { abandonTask } from "./abandon.mjs";
export { parseTaskArguments } from "./arguments.mjs";
export { parseTaskBranch, taskBranchName } from "./branch-name.mjs";
export { runCheck } from "./check-command.mjs";
export { CONTRACT_TESTS, contractGate, runContractTests } from "./contract/index.mjs";
export { runTaskCommandLine } from "./command-line.mjs";
export { dirtyLines } from "./dirty-lines.mjs";
export { finishTask } from "./finish.mjs";
export { gitAnsweredNo } from "./git-answered-no.mjs";
export { runGit } from "./git-command.mjs";
export { listTasks } from "./list.mjs";
export { branchCheckedOutElsewhere, listWorktrees, locateTask } from "./locate.mjs";
export { samePath } from "./path-identity.mjs";
export { pathInside } from "./path-inside.mjs";
export { noteTaskProgress } from "./progress-note.mjs";
export { recordTaskId } from "./record-task-id.mjs";
export { startTask } from "./start.mjs";
export { allocateTaskId, chooseTaskId } from "./task-id.mjs";
export { TASK_ID_REF_PREFIX } from "./task-id-ref-prefix.mjs";
