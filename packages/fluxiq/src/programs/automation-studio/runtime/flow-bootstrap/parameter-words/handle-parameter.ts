// Whether a node parameter takes a handle (t514).
//
// A model names an element by the handle a view printed, and a Flow script
// writes it bare: `target: t5`. Core used to read any bare word under any
// object parameter as such a handle, so `absent`, written under a parameter
// that describes the page after a step, became `{ handle: "absent" }` and was
// refused as a handle no view had printed (`run-mv6v2jh4-69244ffb`, step 0083).
//
// A parameter says it takes a handle the way it says anything about its value:
// by its declared example. Two shapes say so:
//
// - **A handle reference, or a request led by one**: the example's `handle` is
//   a string (`target: {handle: "t5"}`, a list read `{handle: "extraction.1",
//   fields: ...}`).
// - **A request that only names things**: every field of the example is a
//   string (`nextPage: {list: "extraction.1", control: "t9"}`). Such a request
//   names what it acts on, and a domain reads its handle written alone as the
//   one thing it must name -- Core's own script format writes
//   `nextPage: extraction.1`, which the web domain has read as the list since
//   t489.
//
// A parameter with no example, or one whose example is settings (numbers,
// lists, nested objects), takes no handle: a bare word there is a value it
// cannot read. The authoring reader (`../authoring/values.ts`) reads a bare
// word as a handle only for a parameter that takes one, and the near-name
// fallback (`../plan/name-correction.ts`) lets a bare word reach an object parameter
// only when it is one.
import type { AutomationNodeParameter } from "../../../nodes/index.ts";

/** The key a handle reference is written under (`../../llm/harness-options/plan-node-handles.ts`). */
const HANDLE_KEY = "handle";

/** Whether the parameter takes a handle, by its declared example (header). */
export function automationStudioParameterTakesHandle(parameter: AutomationNodeParameter): boolean {
  if (parameter.valueType !== "object" && parameter.valueType !== "json") return false;
  if (parameter.ui?.control === "record-output") return false;
  const example = parameter.example;
  if (typeof example !== "object" || example === null || Array.isArray(example)) return false;
  if (typeof example[HANDLE_KEY] === "string") return true;
  const fields = Object.values(example);
  return fields.length > 0 && fields.every((field) => typeof field === "string");
}
