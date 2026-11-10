import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import { readThreads, type HomeThread } from "../../model";

/** Every thread the person can see, across projects (`list-conversations` with no project). */
export async function loadThreads(studio: ProgramCommandTransport, signal: AbortSignal): Promise<HomeThread[]> {
  const response = await studio.post<unknown>("list-conversations", { projectId: null, status: "open" }, { signal });
  if (!response.ok) throw new Error("list-conversations failed");
  return readThreads(response.payload);
}
