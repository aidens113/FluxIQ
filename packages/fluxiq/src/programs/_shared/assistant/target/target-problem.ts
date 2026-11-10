import { assistantEndpointConsequence } from "../endpoint-consequence.ts";
import { assistantProbedResource } from "./probed-resource.ts";
import { assistantResourceItem } from "./resource-item.ts";
import type { AssistantTargetSubject } from "../types.ts";

const DELETING: ReadonlySet<string> = new Set(["destructive", "destructive-ungated"]);
const LOOKS: ReadonlySet<string> = new Set(["List", "Read"]);

/**
 * What is wrong with what an assistant tool says it acts on, or undefined.
 * The registry refuses a registration with a problem (review P9-R2, S4):
 *
 * - a deleting endpoint whose consequence is `read`, `change` or `per-call`:
 *   it could run without asking, on a grant minted on no one's words;
 * - a `target` naming a field the input does not have;
 * - a `delete` or `security` act (not a list or a read) with no target a
 *   person could name: its `resource` must name a project, Flow, run,
 *   dataset, recording, key, connected browser, schedule or person, or its
 *   `target` must name the input fields that hold what it acts on. Without
 *   one, the assistant could neither name the act on its card nor tell an
 *   input that widens it from one that does not.
 */
export function assistantTargetProblem(subject: AssistantTargetSubject): string | undefined {
  const declared = subject.assistant.consequence;
  const consequence = assistantEndpointConsequence({ programId: subject.programId, endpoint: subject.endpoint, classification: subject.classification, accessLevel: subject.accessLevel, ...(declared === undefined ? {} : { declared }) });
  if (DELETING.has(subject.classification) && (consequence === "read" || consequence === "change" || consequence === "per-call")) return `it deletes, so its consequence cannot be ${consequence}: a person must be asked first`;
  const target = subject.assistant.target;
  const needsTarget = (consequence === "delete" || consequence === "security") && !LOOKS.has(subject.accessLevel);
  if (target === undefined && !needsTarget) return undefined;
  const fields = Object.keys((subject.assistant.input.jsonSchema().properties ?? {}) as object);
  const unknown = Object.keys(target ?? {}).filter((field) => !fields.includes(field));
  if (unknown.length) return `target names ${unknown.join(", ")}, which the input does not have`;
  if (!needsTarget || target !== undefined) return undefined;
  if (subject.resource === undefined) return `it is a ${consequence} act with nothing to name: declare a resource or a target`;
  const probed = assistantProbedResource(subject.resource, fields);
  const nameable = probed.refs.length > 0 && probed.refs.every((ref) => assistantResourceItem(ref) !== undefined);
  return nameable ? undefined : `it is a ${consequence} act whose resource names nothing a person could (the workspace, the program, themselves): declare a target naming the input fields it acts on`;
}
