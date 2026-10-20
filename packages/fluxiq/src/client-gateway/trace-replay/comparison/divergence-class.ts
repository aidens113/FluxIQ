// Classifies a delivery point whose replayed event differs from the recorded
// one (traces and offline trials, P3), in this order:
//
// - `capture_gap` when the replay noted the trace lacked what it needed for
//   this event (its input, its session, its command), or the two were
//   recorded under different payload schemas;
// - `nondeterminism` when only ids or times Core minted differ
//   (`minted-fields.ts`): the feed of recorded ids and times missed them;
// - `intake_defect` otherwise: the same input, a different derivation.

import { CLIENT_GATEWAY_TRACE_MINTED_FIELDS } from "./minted-fields.ts";
import type { ClientGatewayTraceParityClass } from "../types.ts";

export function classifyClientGatewayTraceDivergence(fields: readonly string[], gap: string | undefined): { readonly class: ClientGatewayTraceParityClass; readonly detail: string } {
  if (gap !== undefined) return { class: "capture_gap", detail: gap };
  if (fields.some((field) => field.startsWith("payloadSchema"))) return { class: "capture_gap", detail: "recorded under another payload schema than the replay records" };
  if (fields.length > 0 && fields.every((field) => CLIENT_GATEWAY_TRACE_MINTED_FIELDS.has(field))) return { class: "nondeterminism", detail: `only ids or times Core minted differ: ${fields.join(", ")}` };
  return { class: "intake_defect", detail: `the same input, a different derivation: ${fields.join(", ")}` };
}
