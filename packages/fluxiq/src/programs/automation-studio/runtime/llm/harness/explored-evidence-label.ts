// Core's label for a packet a recovery's exploration returned, and the
// qualified form a handle taken from that packet is written in.
//
// A domain numbers its handles per packet, so `target.3` in the failure packet
// and `target.3` in a page the exploration revealed are different controls.
// The label says which packet a handle came from. Four places depend on it:
// the recovery's exploration writes it, the packet builder carries only
// packets labelled with it, the provider shows the model the qualified form,
// and the target check reads a qualified handle back. The format used to be
// written twice -- once where the exploration made and parsed labels, once as
// the packet builder's own pattern -- and the two agreed only because tests
// tied them together. This file is the one definition, beside the packet
// builder, and `runtime/recovery` takes it from here (that direction of import
// is the legal one).
//
// The ordinal has at most three digits. An exploration returns at most one
// packet per tool call, and `tests/explored-evidence-label.test.ts` fails if
// the evidence loop's ceiling on tool calls ever outgrows that.

const LABEL_PREFIX = "explored.";
const LABEL = /^explored\.[1-9][0-9]{0,2}$/u;
const QUALIFIED_HANDLE = /^(explored\.[1-9][0-9]{0,2}):(.+)$/u;

/** The largest ordinal a label can carry. */
export const AUTOMATION_STUDIO_EXPLORED_EVIDENCE_MAX_ORDINAL = 999;

/** The label of the `ordinal`th packet an exploration returned, counting from one. */
export function automationStudioExploredEvidenceLabel(ordinal: number): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > AUTOMATION_STUDIO_EXPLORED_EVIDENCE_MAX_ORDINAL) {
    throw new RangeError(`An explored packet is numbered from 1 to ${AUTOMATION_STUDIO_EXPLORED_EVIDENCE_MAX_ORDINAL}.`);
  }
  return `${LABEL_PREFIX}${ordinal}`;
}

/** Whether a value is a label this module writes, and so one a handle can be qualified with. It never contains a colon. */
export function isAutomationStudioExploredEvidenceLabel(value: unknown): value is string {
  return typeof value === "string" && LABEL.test(value);
}

/**
 * A handle as a runtime patch wrote it, read the one way Core writes it.
 *
 * `qualified` names the explored packet it was taken from, by its label, and
 * carries the handle as that packet issued it -- everything after the first
 * colon. Anything without the qualifier is `unqualified` and stands exactly as
 * written: a handle taken from the failure packet, which is how every handle
 * was read before explored packets reached a patch.
 */
export function automationStudioExploredEvidenceHandle(
  handle: string
): { kind: "unqualified"; handle: string } | { kind: "qualified"; evidenceId: string; handle: string } {
  const qualified = QUALIFIED_HANDLE.exec(handle);
  return qualified ? { kind: "qualified", evidenceId: qualified[1]!, handle: qualified[2]! } : { kind: "unqualified", handle };
}
