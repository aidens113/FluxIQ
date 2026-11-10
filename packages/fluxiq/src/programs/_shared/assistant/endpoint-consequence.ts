import type { AssistantConsequence } from "@fluxiq/contracts/program-api-inputs";
import { ASSISTANT_CONSEQUENCE_OVERRIDES } from "./consequence-overrides.ts";
import type { AssistantConsequenceSubject } from "./types.ts";

// Every endpoint of these programs touches keys, sign-in or people's access.
const SECURITY_PROGRAMS: ReadonlySet<string> = new Set(["identity-access", "secret-keys"]);
const DELETING: ReadonlySet<string> = new Set(["destructive", "destructive-ungated"]);

/**
 * The consequence class of calling one endpoint, first rule that applies:
 *
 * 1. the registration's explicit `consequence`;
 * 2. `ASSISTANT_CONSEQUENCE_OVERRIDES` (the runs are `per-call`);
 * 3. `security`: an `identity-access` or `secret-keys` endpoint, access level
 *    `PermissionsManagement`, or classification `program-gated`;
 * 4. `delete`: classification `destructive` or `destructive-ungated`;
 * 5. `read`: classification `read`, or access level `List` or `Read` (a list
 *    that also refreshes a cache is still a look for the person);
 * 6. `change`: classification `authoring`.
 *
 * A classification none of these name throws: a new one needs a rule here.
 */
export function assistantEndpointConsequence(subject: AssistantConsequenceSubject): AssistantConsequence | "per-call" {
  if (subject.declared !== undefined) return subject.declared;
  const key = `${subject.programId}/${subject.endpoint}`;
  const override = Object.hasOwn(ASSISTANT_CONSEQUENCE_OVERRIDES, key) ? ASSISTANT_CONSEQUENCE_OVERRIDES[key] : undefined;
  if (override !== undefined) return override;
  if (SECURITY_PROGRAMS.has(subject.programId)) return "security";
  if (subject.accessLevel === "PermissionsManagement" || subject.classification === "program-gated") return "security";
  if (DELETING.has(subject.classification)) return "delete";
  if (subject.classification === "read" || subject.accessLevel === "List" || subject.accessLevel === "Read") return "read";
  if (subject.classification === "authoring") return "change";
  throw new TypeError(`${key}: classification ${JSON.stringify(subject.classification)} has no assistant consequence; add a rule or an override.`);
}
