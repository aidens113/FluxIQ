import type { ProgramEndpointResource, ProgramResourceRef } from "../../iam/index.ts";

// A value no real input holds, naming the field it was put in.
const PROBE = "\u0000probe:";

/**
 * Which of `fields` a registration's IAM `resource` reads, found by asking it
 * for the resources of a payload whose every field holds its own name: a
 * field is read when its value comes back in a ref. `refs` are what that
 * payload decides on. `resource.of` is pure (`endpointResource`), so asking
 * changes nothing; a custom resource that reads a value in some other way is
 * found to read nothing, which only makes more of its input count as wider
 * than its target.
 */
export function assistantProbedResource(resource: ProgramEndpointResource, fields: readonly string[]): { fields: string[]; refs: readonly ProgramResourceRef[] } {
  const payload = Object.fromEntries(fields.map((field) => [field, `${PROBE}${field}`]));
  const decided = resource.of({ programId: "~", endpoint: "~", scope: {}, payload });
  const refs = isRefList(decided) ? decided : [decided];
  const seen = new Set(refs.flatMap((ref) => Object.values(ref)).filter((value): value is string => typeof value === "string" && value.startsWith(PROBE)));
  return { fields: fields.filter((field) => seen.has(`${PROBE}${field}`)), refs };
}

function isRefList(refs: ProgramResourceRef | readonly ProgramResourceRef[]): refs is readonly ProgramResourceRef[] {
  return Array.isArray(refs);
}
