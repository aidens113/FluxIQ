// The values a dispatched answer hands on through its node's data outputs (t646).
//
// An output node's dispatcher answers with the domain's payload, which the
// executor keeps whole at `outputs.result`; no port declares `result`, so a
// later step could not read it (t639 refuses a binding to an undeclared port).
// A single-value read answered its value there and nowhere else: a builder that
// had to hand one value on could not, and copied a list extraction instead.
//
// A data output that declares `resultPath` says where in that answer its value
// lies (`AutomationNodePort.resultPath`). After a successful dispatch the value
// found there is copied to `outputs.<port id>`, where the run keeps it as
// `<node id>.<port id>` and `$step.<label>.<port id>` reads it. Nothing is made
// up: a path that finds nothing adds nothing, and an output key the dispatch or
// a record capture already wrote -- `records`, `result`, `error` -- is never
// replaced. The answer arrives here already screened by its domain (a value
// read off a sensitive control is not in it), so the copy carries nothing the
// answer did not.
import { parseAutomationStudioRecordsPath } from "@fluxiq/contracts/automation-studio";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodePort } from "../../../nodes/index.ts";

/** The values `ports` declare by `resultPath`, read off `outputs.result`; empty when none is found (header). */
export function automationStudioResultPathOutputs(
  outputs: Readonly<Record<string, JsonValue>>,
  ports: readonly AutomationNodePort[] | undefined
): Record<string, JsonValue> {
  const found: Record<string, JsonValue> = {};
  for (const port of ports ?? []) {
    if (port.role !== "data" || port.resultPath === undefined || Object.hasOwn(outputs, port.id)) continue;
    const segments = parseAutomationStudioRecordsPath(port.resultPath);
    const value = segments ? valueAtPath(outputs.result, segments) : undefined;
    if (value !== undefined) found[port.id] = value;
  }
  return found;
}

function valueAtPath(value: JsonValue | undefined, segments: readonly string[]): JsonValue | undefined {
  let current = value;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !Object.hasOwn(current, segment)) return undefined;
    current = (current as Record<string, JsonValue>)[segment];
  }
  return current;
}
