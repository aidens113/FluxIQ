// What a `rerun` runs with: the step's own argument, changed only where the
// model said.
//
// **Why the model no longer writes the whole argument (t211).** A rerun used to
// carry "the whole argument to run the step's action with", and its schema was
// `{ type: "object" }` -- so to change one condition of a list read, the model
// rewrote the node, every column, every condition and the paging from memory,
// several levels deep, as free-form JSON. Those were the replies that came back
// unreadable. Lane C's re-author of `run-munw7ffn-fe1cecd2` sent 35 decisions:
// its reruns ran to 550-590 output tokens each, and 14 of its replies were
// `llm.provider_malformed_response`, every one of them between two such reruns
// and as slow as one (2.6-3.2 s against 1.3-2.0 s for a short decision). The
// same build's other adaptation, whose reruns stayed under 490 tokens, had
// none; the lane-A runs, whose decisions were 80-120-token tool calls, had one
// in 25 to 54. Truncation was ruled out: a reply cut at the output limit is
// reported as `llm.provider_output_truncated`, not malformed, no bundle holds
// one, and the 8,000-token reply reserve is the same before and after the
// input window grew to 1,000,000 tokens (t200).
//
// So a rerun's `input` is a JSON merge patch (RFC 7386) over the argument the
// step last ran with: only the keys that change, at the depth they sit. An
// object merges into the object there, any other value -- a list, a string, a
// number -- replaces what is there whole, and `null` removes the key. A model
// that still sends the whole argument gets exactly that argument for every key
// it wrote; what it left out is kept rather than dropped, which is the safe
// direction: a key it forgot to write is not a key it meant to remove.
//
// **Two ways a patch lost what the model meant (t194-w39, `run-muq66ff9-cb3767a1`).**
//
// *Where the patch sits.* A step run through `core.run_node` ran with
// `{node, parameters}`, and the draft shows it that way, so "only the keys that
// change" reads two ways: the keys of that argument, or the keys of the node's
// parameters. The re-author wrote both, alternately -- `{extractList: ...}` and
// `{parameters: {extractList: ...}}` -- and each of the first kind was merged in
// as a third top-level key and refused `unexpected_input_keys`: fourteen of its
// decisions. A patch over such an argument that names none of `node`,
// `parameters` or `consequences` can only mean the parameters, so it is read as
// their patch. One that names any of them is read as written; one that mixes
// both still reaches the caller as written and is refused there, with the keys
// the call takes.
//
// *What the model was never shown.* A re-author's steps are the Flow's own
// nodes, parameters and all (`../node-tools/draft-from-flow.ts`), and the copy
// the model reads has every key the domain denies withheld
// (`../harness/draft-screen.ts`) -- in the web's case each column's and each
// condition's `selector`. An object patched over an object keeps them, because
// it merges. A list does not: it replaces whole, so a `where` rewritten from the
// copy the model read lost every condition's selector, each condition read the
// list item's root instead of its column, and eight of the nine re-author reruns
// that ran answered unfiltered. So an object **inside** an item of a list
// written over a list keeps what the model could not see of it, taken from the
// first of:
//
//   1. the stored item it restates. An object the patch writes inside the item
//      restates the stored one when it says nothing the stored one does not say
//      the same way, only less. Of several such items: the one at the same
//      position with the same keys, then the only one with the same keys, then
//      the only one, then -- when the list kept its length -- the one at the
//      same position;
//   2. the one entry of a map beside the list that it restates, as the merged
//      argument now holds it: a condition the model rewrote against a column it
//      also changed is that column, by its key.
//
// Nothing else is filled in. A key the item itself leaves out stays out -- the
// model saw it and left it out -- and an object that restates no stored one, or
// several entries of a map equally, runs exactly as written, so a guess never
// puts one column's locator under another column's condition. Which column a
// key names is still the caller's to resolve; this keeps only what Core withheld.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** The keys of a `core.run_node` argument (`../node-tools/run-node.ts`). */
const NODE_KEY = "node";
const PARAMETERS_KEY = "parameters";
const CONSEQUENCES_KEY = "consequences";

/** The argument a rerun runs with: `patch` merged over `previous` (RFC 7386). */
export function automationStudioLlmEvidenceRerunInput(previous: JsonObject | undefined, patch: JsonObject): JsonObject {
  const target = structuredClone(previous ?? {});
  return mergePatch(target, placed(target, patch));
}

/** The patch where it was meant: a node's parameters when it was written as their keys alone. */
function placed(target: JsonObject, patch: JsonObject): JsonObject {
  const names = Object.keys(patch);
  if (names.length === 0 || !Object.hasOwn(target, NODE_KEY) || !isObject(target[PARAMETERS_KEY])) return patch;
  if (names.some((name) => name === NODE_KEY || name === PARAMETERS_KEY || name === CONSEQUENCES_KEY)) return patch;
  return { [PARAMETERS_KEY]: patch };
}

function mergePatch(target: JsonObject, patch: JsonObject): JsonObject {
  const merged: JsonObject = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete merged[key];
      continue;
    }
    const current = merged[key];
    merged[key] = isObject(value) ? mergePatch(isObject(current) ? current : {}, value) : structuredClone(value);
  }
  // After every key is merged, so a list item is read against its maps as they
  // now stand: a column the same patch changed is the column it means.
  for (const [key, value] of Object.entries(patch)) {
    const stored = target[key];
    if (Array.isArray(value) && Array.isArray(stored)) merged[key] = restoredList(value, stored, merged);
  }
  return merged;
}

/** A list written over a stored one, each object inside each item keeping what the model was not shown of it. */
function restoredList(written: JsonValue[], stored: JsonValue[], beside: JsonObject): JsonValue[] {
  return written.map((item, index) => {
    if (!isObject(item)) return structuredClone(item);
    const source = restatedItem(item, index, written.length === stored.length, stored);
    const out: JsonObject = structuredClone(item);
    for (const [key, value] of Object.entries(item)) {
      if (!isObject(value)) continue;
      const from = source !== undefined && isObject(source[key]) ? source[key] : onlyRestatedEntry(value, beside);
      if (from !== undefined) out[key] = structuredClone(from);
    }
    return out;
  });
}

/** The stored item an item restates, or none when it restates none or no rule settles which. */
function restatedItem(item: JsonObject, index: number, sameLength: boolean, stored: readonly JsonValue[]): JsonObject | undefined {
  const objects = Object.entries(item).filter(([, value]) => isObject(value));
  if (objects.length === 0) return undefined;
  const candidates = stored.flatMap((entry, at) =>
    isObject(entry) && objects.every(([key, value]) => restates(value as JsonObject, entry[key])) ? [{ entry, at }] : []);
  const keyed = candidates.filter(({ entry }) => sameKeys(item, entry));
  const atIndex = (among: typeof candidates) => among.find(({ at }) => at === index)?.entry;
  return atIndex(keyed)
    ?? (keyed.length === 1 ? keyed[0]!.entry : undefined)
    ?? (candidates.length === 1 ? candidates[0]!.entry : undefined)
    ?? (sameLength ? atIndex(candidates) : undefined);
}

/** The one entry of a map beside the list that `value` restates, when exactly one does. */
function onlyRestatedEntry(value: JsonObject, beside: JsonObject): JsonObject | undefined {
  const found = new Map<string, JsonObject>();
  for (const map of Object.values(beside)) {
    if (!isObject(map)) continue;
    for (const entry of Object.values(map)) {
      if (restates(value, entry)) found.set(JSON.stringify(entry), entry);
    }
  }
  return found.size === 1 ? [...found.values()][0] : undefined;
}

/**
 * Whether `written` says something, and nothing `stored` does not say the same
 * way: the same object, possibly with less in it. An empty object says nothing
 * and so restates nothing, or it would restate everything.
 */
function restates(written: JsonObject, stored: JsonValue | undefined): stored is JsonObject {
  if (!isObject(stored) || Object.keys(written).length === 0) return false;
  return Object.entries(written).every(([key, value]) => {
    if (!Object.hasOwn(stored, key)) return false;
    const held = stored[key];
    return JSON.stringify(value) === JSON.stringify(held) || (isObject(value) && restates(value, held));
  });
}

function sameKeys(left: JsonObject, right: JsonObject): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key));
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
