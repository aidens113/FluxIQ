// A key of a tool's input written beside a tool call's `input` instead of in
// it, moved into `input` before the call is checked.
//
// **Every plan of `run-mvcwp3wh-bcea2115` was lost to this** (2026-10-17): the
// supervisor wrote its plan tool's `reason` after the input's last key but
// closed `input` first, so `reason` sat at `response.decision.reason`. Ten of
// the twelve replies lost count of their closers and could not be read at all;
// the two that could were refused `llm_output.unexpected_field` with no path,
// and six unreadable replies in a row ended the build. The model meant the key
// as an input key, and the tool's own schema says it is one.
//
// So a key is moved when all of these hold, and only then:
//
//   - the decision is a `tool_call` whose `input` is an object;
//   - the tool it names was offered to this decision and its own declared
//     input schema has the key as a property (at the top level, or in one of
//     the schema's top-level `oneOf`, `anyOf` or `allOf` variants);
//   - `input` does not already hold that key -- a value the call did place
//     inside is never overwritten;
//   - the key is not one of the tool call's own (`kind`, `callId`, `toolId`,
//     `input`, `add`, `act`, `place`), and it is not `write`, whose misplacement
//     keeps its own explicit correction (`../unusable-decision.ts`).
//
// This is grammar only. The harness folds a decision before it checks it
// (`../harness/provider-result.ts`), so the moved input then goes through
// every check an input written in place would: the parser's own, the tool's
// input checks, the permission gates and the repeat guard. Any key beside
// `input` that is not moved is still refused as an unexpected field. The
// harness records the move as an `info` diagnostic,
// `llm_output.key_moved_into_input`, naming the keys from the tool's schema,
// never a word of the reply.
//
// Nothing here imports the harness: the harness imports this.

import type { JsonObject } from "../../../../../core/index.ts";

/** A tool call's own keys: anything else written beside `input` belongs in it, or nowhere. */
const TOOL_CALL_KEYS: ReadonlySet<string> = new Set(["kind", "callId", "toolId", "input", "add", "act", "place"]);

/** The key whose misplacement keeps its explicit correction rather than being moved. */
const WRITE_KEY = "write";

/** The schema keywords whose variants may each declare an input property. */
const VARIANT_KEYWORDS = ["oneOf", "anyOf", "allOf"] as const;

/** A tool as the fold needs it: the id a call names and the input schema it declares. */
type FoldableTool = { readonly toolId: string; readonly inputSchema: JsonObject };

/**
 * The decision with every key the named tool's input schema declares moved
 * into its `input`, the offered tool's id, and the moved keys as that tool's
 * schema names them; `undefined` when nothing was moved, and the decision
 * stands as it came.
 */
export function automationStudioLlmToolCallKeysFolded(
  decision: unknown,
  tools: readonly FoldableTool[] | undefined
): { decision: Record<string, unknown>; toolId: string; movedKeys: string[] } | undefined {
  if (!tools?.length || !isRecord(decision) || decision.kind !== "tool_call" || !isRecord(decision.input)) return undefined;
  const tool = tools.find((offered) => offered.toolId === decision.toolId);
  if (!tool) return undefined;
  const input = decision.input;
  const movedKeys = [...declaredInputKeys(tool.inputSchema)].filter((key) => Object.prototype.hasOwnProperty.call(decision, key)
    && !TOOL_CALL_KEYS.has(key) && key !== WRITE_KEY && !Object.prototype.hasOwnProperty.call(input, key));
  if (!movedKeys.length) return undefined;
  const moved = new Set(movedKeys);
  const folded: Record<string, unknown> = {};
  const foldedInput: Record<string, unknown> = { ...input };
  for (const [key, value] of Object.entries(decision)) {
    if (key === "input") continue;
    // Defined, never assigned, so no key can reach a prototype.
    Object.defineProperty(moved.has(key) ? foldedInput : folded, key, { value, enumerable: true, writable: true, configurable: true });
  }
  folded.input = foldedInput;
  return { decision: folded, toolId: tool.toolId, movedKeys };
}

/** Every property name the schema declares at its top level or in one of its top-level variants. */
function declaredInputKeys(schema: JsonObject): Set<string> {
  const keys = new Set<string>();
  const add = (variant: unknown) => {
    if (isRecord(variant) && isRecord(variant.properties)) for (const key of Object.keys(variant.properties)) keys.add(key);
  };
  add(schema);
  for (const keyword of VARIANT_KEYWORDS) {
    const variants = schema[keyword];
    if (Array.isArray(variants)) variants.forEach(add);
  }
  return keys;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
