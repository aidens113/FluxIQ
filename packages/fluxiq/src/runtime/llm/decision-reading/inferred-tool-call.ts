// A decision that can only be a tool call, read as one when its `kind` says
// nothing Core knows.
//
// **Every refused decision of 81 logged runs was this shape** (R4,
// 2,728 decisions, 9 refused in 7 runs): `kind` held `"callId"` -- the key's
// name written as the value -- and 6 of the 9 left the id out, while each named
// an offered tool with a valid input object. Each refusal cost a paid call and
// the next decision re-sent the same call, which ran. t1025 found the same
// shape under `kind: "loop_decision"` (bigbox runs of 2026-11-24, two replies
// calling `core.loop_decision` exactly right otherwise).
//
// A `toolId` string and an `input` object, with no `result` and no
// `amendments`, can be nothing but a tool call: `complete` needs `result` and
// `amend_draft` needs `amendments`. So the kind is filled in, and where the
// `callId` is missing or not a valid id one is derived from the tool and its
// input (`./derived-call-id.ts`). Nothing else is relaxed: the tool call's
// keys, the tool being offered and its input schema are checked exactly as for
// a decision that named its kind. A known kind is never relabelled, so a
// `complete` carrying a `toolId` is still refused.

import type { JsonObject } from "../../../core/index.ts";
import { automationStudioLlmDecisionDerivedCallId } from "./derived-call-id.ts";

/** The kinds a decision may name. */
const DECISION_KINDS: ReadonlySet<unknown> = new Set(["tool_call", "complete", "amend_draft"]);

const ID = /^[a-z0-9_.:-]{1,200}$/i;

/** The decision read as a tool call, what its kind was written as, and whether its id was derived; nothing when it is not this shape. */
export function automationStudioLlmDecisionInferredToolCall(decision: unknown): { decision: Record<string, unknown>; kindWritten: "absent" | "unknown" | "not_a_string"; callIdFilled: boolean } | undefined {
  if (!isRecord(decision) || DECISION_KINDS.has(decision.kind)) return undefined;
  if (typeof decision.toolId !== "string" || !isRecord(decision.input) || decision.result !== undefined || decision.amendments !== undefined) return undefined;
  const callIdFilled = !(typeof decision.callId === "string" && ID.test(decision.callId));
  const callId = callIdFilled ? automationStudioLlmDecisionDerivedCallId(decision.toolId, decision.input as JsonObject) : decision.callId;
  const kindWritten = decision.kind === undefined ? "absent" : typeof decision.kind === "string" ? "unknown" : "not_a_string";
  return { decision: { ...decision, kind: "tool_call", callId }, kindWritten, callIdFilled };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
