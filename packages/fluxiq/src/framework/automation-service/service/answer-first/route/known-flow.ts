// The Flow a task already lives under, for the chat to reuse rather than make a blank one: only
// the exact same task (same words, same site) has one, and only once a Flow was saved for it.

import { automationStudioAnswerFirstTaskKey } from "../task-key/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf, type AutomationStudioAnswerFirstTaskMemoryPorts } from "../task-memory/index.ts";

export async function automationStudioAnswerFirstKnownFlow(owner: object, ports: AutomationStudioAnswerFirstTaskMemoryPorts, input: { projectId: string; instructionText: string; startLocation?: string | undefined }): Promise<string | undefined> {
  const memory = await automationStudioAnswerFirstTaskMemoryOf(owner, ports).get(input.projectId, automationStudioAnswerFirstTaskKey(input));
  if (!memory || (!memory.best && !memory.latest)) return undefined;
  return memory.flowId || memory.best?.flowId || memory.latest?.flowId || undefined;
}
