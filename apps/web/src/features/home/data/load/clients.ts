import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import { readClients, type HomeClient } from "../../model";

/** The clients and hosts connected to the engine (runtime program, `list-clients`). */
export async function loadClients(runtime: ProgramCommandTransport, signal: AbortSignal): Promise<HomeClient[]> {
  const response = await runtime.post<unknown>("list-clients", {}, { signal });
  if (!response.ok) throw new Error("list-clients failed");
  return readClients(response.payload);
}
