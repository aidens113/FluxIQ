// The words a task is known by (design D10: "the same words on the same site").
//
// `instructionText` is every active instruction as `title\nbody`, which is what the checks and the
// judge read. The chat's "a task done before lives under a Flow already"
// (`../route/known-flow.ts`, asked with what the person typed) never matched a key made from that,
// so every repeat in the chat made a new blank Flow, and a saved read names its list by a handle
// that belongs to the Flow it was detected on (`domain/.../structure/handles.ts`): the saved steps
// then did not assemble and the attempt never ran them.
//
// So where the Flow holds one generation goal, which is the person's own message as it was saved
// (`../../flow-bootstrap-commands/save-goal.ts`), its body names the task. Any other instruction
// beside it is the Flow's, not the task's. A Flow with no one goal keeps the whole text.

const GOAL_TAG = "generation";

export function automationStudioAnswerFirstTaskWords(input: { instructionText: string; activeInstructions?: readonly { scopeKind?: string | undefined; tags?: readonly string[] | undefined; body: string }[] | undefined }): string {
  const goals = (input.activeInstructions ?? []).filter((instruction) => instruction.scopeKind === "flow" && instruction.tags?.includes(GOAL_TAG) === true);
  return goals.length === 1 ? goals[0]!.body : input.instructionText;
}
