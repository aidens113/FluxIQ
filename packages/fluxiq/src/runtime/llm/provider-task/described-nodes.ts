// Where a described node's definition goes in a decision's evidence.
//
// **Never in the head (t869).** A definition is shown on the window entry of the
// call that first described it (t289-G, W11), and that entry joined the window at
// its end and never changes, so a describe alters no byte before it. A definition
// no entry names used to stay in the head's `flowBootstrap.describedNodes`, on the
// reasoning that only an earlier round's node could be one. It was not so: a look
// Core took for itself ran the library through the describing wrapper, and the
// node it described landed in front of the tools and the whole window. At step 39
// of `run-mw37vz9n-a77a02c2` that re-sent 70K characters. So nothing goes there now:
//
// - A definition described before the first one this window names is an earlier
//   round's. It is shown on one entry in front of the window (`EARLIER_TOOL_ID`),
//   fixed for the window's length, so the head is the same across rounds.
// - A definition described after that, which no entry names, is not one a settled
//   place can take without moving what was sent. It rides after the window on an
//   entry that moves (`LATE_TOOL_ID`). Core's own looks no longer describe
//   (`../node-tools/describing-failures.ts`), so this is the guard, not the path.
//
// Each definition appears exactly once per request either way, and an entry is
// copied, never changed in place, and keeps its key order.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowBootstrapCatalogEntry } from "../../flow-authoring/bootstrap/index.ts";

/**
 * The key a call's result names the nodes it newly described under, and where
 * their definitions are shown. The same name as
 * `AUTOMATION_STUDIO_LLM_DESCRIBED_NODES_KEY` (`../node-tools/described-nodes-key.ts`),
 * written here rather than imported so the adapter takes no edge into the
 * node tools; `../tests/provider-cache-prefix.test.ts` runs the two together.
 */
const DESCRIBED_NODES_KEY = "describedNodes";

const EARLIER_TOOL_ID = "core.described_nodes";
const LATE_TOOL_ID = "core.newly_described_nodes";

type Entry = { callId: string; toolId: string; value: JsonValue };

/** The window with every described node's definition placed, each once. */
export function automationStudioLlmPlaceDescribedNodes(definitions: readonly AutomationStudioFlowBootstrapCatalogEntry[], evidence: readonly Entry[]): Entry[] {
  const byId = new Map(definitions.map((definition) => [definition.id, definition] as const));
  const shown = new Set<string>();
  const showable = (id: unknown): id is string => typeof id === "string" && byId.has(id) && !shown.has(id);
  const placed = evidence.map((entry) => {
    const value = entry.value;
    if (!isRecord(value)) return entry;
    const named = value[DESCRIBED_NODES_KEY];
    if (!Array.isArray(named) || !named.some(showable)) return entry;
    const withDefinitions = named.map((id) => {
      if (!showable(id)) return id;
      shown.add(id);
      return byId.get(id)! as unknown as JsonValue;
    });
    return { ...entry, value: { ...value, [DESCRIBED_NODES_KEY]: withDefinitions } };
  });
  const firstNamed = definitions.findIndex((definition) => shown.has(definition.id));
  const unnamed = (from: number, to: number) => definitions.slice(from, to).filter((definition) => !shown.has(definition.id)) as unknown as JsonValue[];
  const earlier = unnamed(0, firstNamed === -1 ? definitions.length : firstNamed);
  const late = firstNamed === -1 ? [] : unnamed(firstNamed, definitions.length);
  return [
    ...(earlier.length ? [{ callId: EARLIER_TOOL_ID, toolId: EARLIER_TOOL_ID, value: { [DESCRIBED_NODES_KEY]: earlier } }] : []),
    ...placed,
    ...(late.length ? [{ callId: LATE_TOOL_ID, toolId: LATE_TOOL_ID, value: { [DESCRIBED_NODES_KEY]: late } }] : [])
  ];
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
