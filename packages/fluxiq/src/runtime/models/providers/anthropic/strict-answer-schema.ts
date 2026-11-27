// The check's answer tool in a shape strict decoding can hold whole (t1087).
//
// **Live evidence.** `run-mwz2jc4w-0c207128` (Sonnet 5.5), steps 0087 and 0088, byte-identical tools: 0087 answered the
// check as asked, and 0088 sent `diagnosis` as one JSON-encoded string with `answerRecords`, `explorationNeeded` and
// `patchNeeded` beside it at the top level. The answer tool was sent non-strict (`./judge-answer-tool.ts`) because the
// strict schemas of a request share 24 optional parameters (`./grammar.ts`) and the decision tools use 23 of them, so
// nothing but the model's care held a nested object an object. The check was asked again at about $0.25.
//
// **The reshape.** Every property of every object is required, and a property the original schema leaves optional may be
// `null` instead (a type array with `"null"`, or for an enum an `anyOf` with a `null` alternative): it costs a union-typed parameter, not an optional
// one. The platform's limits (structured-outputs page, "Explicit limits"): 20 strict tools, 24 optional parameters, and 16
// parameters with union types (`anyOf` or a type array such as `["string", "null"]`), each across every strict schema of a
// request. The answer then costs no optional parameter, so it fits beside the decision tools and is sent strict. An open
// optional object (`metadata`, which Core strips on the way in anyway) is left out, as `./grammar.ts` leaves it out.
//
// **The reading.** The answer is still read against the judge's unchanged schema, where an optional member is absent, never
// `null`: `automationStudioAnthropicAnswerNullsAbsent` takes each `null` the reshape let through off a member the original
// leaves optional, so a stored or scripted answer that leaves a member out reads as before, and one that writes `null` for it
// reads the same. A `null` on a required member stays, and is a miss. A string where an object belongs is a miss, never read
// back into the object: the grammar is what keeps a model from writing it, not a reader that forgives it.

// **Not sent (lead, 2026-11-27).** Measured against the API on 0088's recorded tools with this reshape last and strict:
// the platform refused the request, "The compiled grammar is too large, which would cause performance issues. Simplify your
// tool schemas or reduce the number of strict tools." The counted limits above held (0 optional, 12 unions); the compiled
// grammar's size is a further limit the structured-outputs page does not count. Every decider request carries the answer
// tool, so sending it strict would refuse every decision: `../../../llm/anthropic/request.ts` sends the judge's own schema,
// non-strict, as before t1087. This module stays for the fix that makes the answer fit (an open item in the page-diff plan).

import { isRecord } from "../../transport/index.ts";

/** An optional member that is an open object (`{ type: "object" }` and nothing more), such as a `metadata` bag: left out of the reshape. */
function isOpenObject(child: unknown): boolean {
  return isRecord(child) && child.type === "object" && child.properties === undefined && child.additionalProperties === undefined && Object.keys(child).length === 1;
}

/** `child` as a schema that also takes `null`, its own constraints and enum kept. */
function orNull(child: Record<string, unknown>): Record<string, unknown> {
  // An enum takes null as its own alternative: the platform refuses `null` inside an enum whose type is an array
  // ("Enum value 'yes' does not match declared type '['string', 'null']'", checked against the API on 0088's tools).
  if (Array.isArray(child.enum)) return { anyOf: [child, { type: "null" }] };
  if (Array.isArray(child.type)) return child.type.includes("null") ? child : { ...child, type: [...child.type, "null"] };
  if (typeof child.type === "string") return { ...child, type: [child.type, "null"] };
  return { anyOf: [child, { type: "null" }] };
}

/** `schema` reshaped as the header says; the schema given is never changed. */
export function automationStudioAnthropicStrictAnswerSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!isRecord(value)) return value;
    const result: Record<string, unknown> = {};
    const required = Array.isArray(value.required) ? value.required : [];
    for (const [key, member] of Object.entries(value)) {
      if (key === "properties" && isRecord(member)) {
        const kept = Object.entries(member).filter(([name, child]) => required.includes(name) || !isOpenObject(child));
        result.properties = Object.fromEntries(kept.map(([name, child]) => {
          const shaped = visit(child) as Record<string, unknown>;
          return [name, required.includes(name) ? shaped : orNull(shaped)];
        }));
        result.required = kept.map(([name]) => name);
      } else if (key !== "required") result[key] = key === "items" ? visit(member) : member;
    }
    return result;
  };
  return visit(schema) as Record<string, unknown>;
}
