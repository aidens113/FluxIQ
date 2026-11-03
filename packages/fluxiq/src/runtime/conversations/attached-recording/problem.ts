// The recording a person attached to the message that asked for a Flow.
//
// It becomes supporting evidence of the Flow the chat creates, never its task
// (`../../service/instruction-led/recordings.ts`), so it is checked before the
// Flow is created: a recording the build would refuse later is refused now,
// in words the person can act on, with nothing made. The checks are the
// build's own (same project, finished, described), read through the registry
// call the panel makes for the same recording.

import type { AutomationStudioConversationCommandContext } from "../commands/index.ts";

const DESCRIPTION_MAX = 4_000;

/**
 * Why the attached recording cannot support a Flow, as a plain cause the
 * progress line can open with; null when it can.
 */
export async function automationStudioConversationAttachedRecordingProblem(context: Pick<AutomationStudioConversationCommandContext, "port" | "projectId">, recordingId: string): Promise<string | null> {
  const read = await context.port.call("get-recording", { projectId: context.projectId, recordingId });
  const recording = (read.payload as { recording?: { description?: unknown; endedAt?: unknown; metadata?: { projectId?: unknown } } } | undefined)?.recording;
  if (!read.ok || !recording || recording.metadata?.projectId !== context.projectId) return "the recording you attached could not be found in this project";
  if (typeof recording.endedAt !== "number" || !Number.isFinite(recording.endedAt)) return "the recording you attached is not finished, so it cannot support a new automation yet";
  const description = typeof recording.description === "string" ? recording.description.trim() : "";
  if (!description) return "the recording you attached has no description, so it cannot support a new automation";
  if (description.length > DESCRIPTION_MAX) return "the description of the recording you attached is too long to support a new automation";
  return null;
}
