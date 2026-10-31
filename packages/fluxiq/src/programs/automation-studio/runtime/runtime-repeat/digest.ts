import { clientGatewayCanonicalDigest } from "../../../../client-gateway/service/command-ledger/index.ts";
import type { AutomationStudioRuntimeRepeatEvidence } from "./evidence.ts";

/** Existing strict canonical JSON hashing; an unreadable/oversized value proves nothing. */
export function automationStudioRuntimeRepeatDigest(value: unknown): AutomationStudioRuntimeRepeatEvidence<string> {
  try {
    return { kind: "known", value: clientGatewayCanonicalDigest(value, { maxDepth: 48, maxBytes: 1_048_576, maxNodes: 20_000 }) };
  } catch {
    return { kind: "unavailable", reason: "unreadable" };
  }
}
