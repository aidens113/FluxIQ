// The one admission every door asks before a reversible lasting act may land
// (t751, R3; it absorbs `site-reset/reset-witness.ts` and the creation
// precondition of `site-reset/create-baselines.ts`).
//
// Rounds 2-5 failed on one class: a lasting act landed with nothing Core could
// read it back by, and every later trial was refused. Each door used to hold
// its own partial rule, and the exploration door asked nothing at all once the
// first lasting act had sealed the baselines. Now one function decides, from
// a declaration and an optional reference, whether the act has a witness
// (`./witness.ts`), and answers that witness or a refusal built through
// `../reset-answers/`. There is no seal here: the same press is answered the
// same way before and after any other act of the build.
//
// The rules, in order:
//
// 1. A reference no receipt printed is refused (`destination_unissued`, met on
//    this page), on any call but an identified creation, which keeps its own
//    refusal for it, as before.
// 2. Not a reversible lasting press -- an observation, no lasting class, or any
//    class outside create_new / modify_existing / delete -- is admitted with no
//    witness: an irreversible act, and one with none, keep their policies.
// 3. An unscoped press (no subject, page or scope) is refused at every project
//    door and at submission. Only explicit standalone exploration keeps `legacy`.
// 4. An identified creation (exactly create_new, about its subject, or its page
//    where it sits in no item) is witnessed by the original its reference or
//    own scope names with the subject absent, else by a witnessed explored act
//    it repeats; otherwise refused `create_baseline_required`, always met on
//    another page: with groups sealed one by one, a list can still be read
//    complete and issue a ref until an act touches it.
// 5. Any other reversible scoped press is witnessed by the destination an
//    issued ref names, the list its control sits in, its own control's place
//    (exactly modify_existing, with a state there and actual pre-act original
//    counts in project mode), or a witnessed explored act
//    it repeats (`../reset-settlement/trial-repeat.ts`, the operation standing
//    for a step's definition); otherwise refused `reset_witness_required`.
//
// The door changes only the words of a refusal: a plan step can carry no
// `resetDestination`, so it is told how its witness is made while exploring.
// Which issued list a creation names is never judged here (t748, C5): the
// refusal names the refs read on this page apart from those read elsewhere.
// Pure.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { automationStudioSiteResetRefusal as refusal, type AutomationStudioSiteResetCanMeet, type AutomationStudioSiteResetFailed } from "../reset-answers/index.ts";
import { automationStudioSiteResetTrialRepeats as repeats } from "../reset-settlement/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "../site-reset/words.ts";
import type { AutomationStudioSiteResetAdmissionInput, AutomationStudioSiteResetAdmissionKnown, AutomationStudioSiteResetAdmissionVerdict } from "./contracts.ts";
import { automationStudioSiteResetIdentifiedCreate as identifiedCreate } from "./identified-create.ts";

/** The classes the site's own controls can reverse. */
const REVERSIBLE: ReadonlySet<AutomationStudioActionConsequence> = new Set(["create_new", "modify_existing", "delete"]);

/** Whether a reversible lasting act has a witness, and which; or the refusal it is answered with (header). */
export function automationStudioSiteResetAdmission(input: AutomationStudioSiteResetAdmissionInput, known: AutomationStudioSiteResetAdmissionKnown): AutomationStudioSiteResetAdmissionVerdict {
  const { declared, reference, door } = input;
  const { control, consequences } = declared;
  const created = identifiedCreate(declared);
  if (!created && known.unissued(reference)) return refused("candidate.reset_destination_unissued", "destination_unissued", "this_page", WORDS.destinationUnissued());
  if (declared.effect !== "mutate" || consequences.length === 0 || !consequences.every((consequence) => REVERSIBLE.has(consequence))) return { kind: "admit" };
  if (control.subject === undefined && control.page === undefined && control.scope === undefined) {
    if (input.requireIdentity || door === "step") return refused("candidate.reset_target_unidentified", "no_target_identity", "no_call", "This lasting step has no target identity, so this build cannot prove what it would change or restore. End honestly naming this condition.");
    return { kind: "admit", witness: { via: "legacy" } };
  }
  const destination = known.destination(declared, reference);
  if (destination) return { kind: "admit", witness: { via: "destination", ref: destination.ref, scope: destination.scope, group: destination.group } };
  if (created) {
    // An invented ref stays insufficient under the creation's own code, whatever it repeats.
    const repeated = known.unissued(reference) ? undefined : repeatedAct(input, known);
    if (repeated) return { kind: "admit", witness: { via: "repeats", act: repeated } };
    const here = new Set(known.here());
    const issued = known.issuedRefs();
    return refused("candidate.create_baseline_required", "no_destination_original", "another_page", door === "step" ? WORDS.stepWitnessRequired(issued) : WORDS.createBaselineRequired(issued.filter((entry) => here.has(entry.ref)), issued.filter((entry) => !here.has(entry.ref))));
  }
  const own = control.scope !== undefined && control.resource !== undefined ? known.original(control.scope, control.resource) : undefined;
  if (own) return { kind: "admit", witness: { via: "own_list", scope: own.scope, group: own.group } };
  if (consequences.length === 1 && consequences[0] === "modify_existing" && control.place !== undefined && control.state !== undefined) {
    if (input.requireIdentity && known.controlOriginal?.(control) !== true) return refused("candidate.reset_witness_required", "no_witness", known.controlOriginalCanBeRead?.(control) ? "this_page" : "no_call", WORDS.controlOriginalRequired());
    return { kind: "admit", witness: { via: "control", place: control.place } };
  }
  const repeated = repeatedAct(input, known);
  if (repeated) return { kind: "admit", witness: { via: "repeats", act: repeated } };
  const issued = known.issuedRefs();
  return refused("candidate.reset_witness_required", "no_witness", "another_page", door === "step" ? WORDS.stepWitnessRequired(issued) : WORDS.witnessRequired(issued));
}

/** The id of the first witnessed explored act this action repeats, or none. */
function repeatedAct(input: AutomationStudioSiteResetAdmissionInput, known: AutomationStudioSiteResetAdmissionKnown): string | undefined {
  const { consequences, control } = input.declared;
  return known.explored().find((other) => other.witnessed && repeats({ consequences, definitionId: input.operation, spot: control }, { consequences: other.consequences, operation: other.operation, spot: other.spot }))?.id;
}

/** A refusal through the one constructor (`../reset-answers/refusal.ts`). */
function refused(code: `candidate.${string}`, failed: AutomationStudioSiteResetFailed, canMeet: AutomationStudioSiteResetCanMeet, instruction: string): AutomationStudioSiteResetAdmissionVerdict {
  return { kind: "refused", evidence: refusal(code, { failed, canMeet, instruction }) };
}
