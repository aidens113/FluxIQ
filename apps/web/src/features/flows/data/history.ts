import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { revisionEntries, type RevisionEntry } from "../wire";

/** The most versions the drawer lists: the endpoint's largest page. */
const VERSIONS_READ = 200;

/** The Flow's saved versions, newest first. Throws when they cannot be read. */
export async function loadHistory(studio: ProgramCommandTransport, flow: { projectId: string; flowId: string }, signal: AbortSignal): Promise<RevisionEntry[]> {
  const answer = await studio.post("list-graph-revisions", { ...flow, limit: VERSIONS_READ }, { signal });
  const entries = answer.ok ? revisionEntries(answer.payload) : undefined;
  if (!entries) throw new Error(answer.error ?? "The versions could not be read.");
  return entries;
}
