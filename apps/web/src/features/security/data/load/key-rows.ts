import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import { shapeKeyRow, type Guarded, type KeyRow } from "../../model";
import { answerIsDenied } from "../answer-is-denied";

/** The model-provider keys (secret-keys `snapshot`). Throws when the read fails for any reason but being refused. */
export async function loadKeyRows(secretKeys: ProgramCommandTransport, signal: AbortSignal): Promise<Guarded<KeyRow[]>> {
  const answer = await secretKeys.get<{ keys?: unknown }>("snapshot", { signal });
  if (answerIsDenied(answer)) return { state: "denied" };
  if (!answer.ok) throw new Error("secret keys failed");
  const keys = Array.isArray(answer.payload?.keys) ? answer.payload.keys : [];
  const rows = keys.flatMap((raw) => {
    const row = shapeKeyRow(raw);
    return row ? [row] : [];
  });
  return { state: "ready", data: rows };
}
