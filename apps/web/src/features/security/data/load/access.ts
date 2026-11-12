import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import { shapeAccess, type AccessRows, type Guarded } from "../../model";
import { answerIsDenied } from "../answer-is-denied";

/** The people, roles and sign-in sessions (identity-access `snapshot`). Throws when the read fails for any reason but being refused. */
export async function loadAccess(identity: ProgramCommandTransport, signal: AbortSignal): Promise<Guarded<AccessRows>> {
  const answer = await identity.get<unknown>("snapshot", { signal });
  if (answerIsDenied(answer)) return { state: "denied" };
  if (!answer.ok) throw new Error("identity access failed");
  return { state: "ready", data: shapeAccess(answer.payload) };
}
