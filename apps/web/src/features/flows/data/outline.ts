import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { outlineAnswer, type OutlineAnswer } from "../wire";

/** The Flow's steps and the version they were read at. Throws when they cannot be read. */
export async function loadOutline(studio: ProgramCommandTransport, flow: { projectId: string; flowId: string }, signal: AbortSignal): Promise<OutlineAnswer> {
  const answer = await studio.post("get-flow-outline", flow, { signal });
  const read = answer.ok ? outlineAnswer(answer.payload) : undefined;
  if (!read) throw new Error(answer.error ?? "The Flow's steps could not be read.");
  return read;
}
