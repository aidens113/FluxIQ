import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { answerIsDenied } from "./answer-is-denied";
import type { ChangeResult } from "./types";

/** Signs one session out (identity-access `revoke-session`), by the digest the snapshot lists it under. */
export async function revokeSession(identity: ProgramCommandTransport, sessionDigest: string): Promise<ChangeResult> {
  const answer = await identity.post("revoke-session", { sessionDigest });
  if (answerIsDenied(answer)) return "denied";
  return answer.ok ? "done" : "failed";
}
