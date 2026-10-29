// What the one admission (`./admission.ts`) is asked, what it reads, and what
// it answers (t751, R3). The port is structural: the original receipts
// (`../site-reset/create-baselines.ts`, `known()`) supply every part but the
// explored acts, which the caller's ledger supplies. Types only.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioSiteResetCanMeet, AutomationStudioSiteResetFailed } from "../reset-answers/index.ts";
import type { AutomationStudioSiteResetDeclared } from "../site-reset/index.ts";
import type { AutomationStudioSiteResetIssuedRef, AutomationStudioSiteResetSettlementSpot } from "../reset-settlement/index.ts";
import type { AutomationStudioSiteResetWitness } from "./witness.ts";

/** A declaration as the gate carries it: its effect, its lasting classes and its control's tokens. */
export type AutomationStudioSiteResetAdmissionDeclared = Pick<AutomationStudioSiteResetDeclared, "effect" | "consequences" | "control">;

/**
 * One action put to the admission. `reference`: the `resetDestination` the call named (an exploration call only; a plan
 * step carries none). `operation`: the registered operation it runs, matched as a trial step's definition against an
 * explored act's landed operation. `door`: where it is asked -- an exploration call, or a plan step at submission or
 * before a trial -- which changes only how a refusal is worded.
 */
export type AutomationStudioSiteResetAdmissionInput = {
  declared: AutomationStudioSiteResetAdmissionDeclared;
  reference?: unknown;
  operation?: string;
  door: "exploration" | "step";
  /** Only a standalone legacy ledger may admit an unidentified reversible press. */
  requireIdentity?: boolean;
};

/** One act this build explored, as an action may repeat it: `witnessed`, it has a witness of its own to lend. */
export type AutomationStudioSiteResetAdmissionExplored = {
  id: string;
  consequences: readonly AutomationStudioActionConsequence[];
  operation?: string | undefined;
  spot?: AutomationStudioSiteResetSettlementSpot | undefined;
  witnessed: boolean;
};

/**
 * What the admission reads of the build (header):
 *
 * - `unissued(reference)`: the reference is present and no receipt printed it;
 * - `destination(declared, reference)`: the original a reversible act's effect would show in -- an identified creation's by
 *   its issued ref or its own scope, with its subject absent there; any other act's only by an issued ref -- with its ref;
 * - `original(scope, resource)`: the list `scope` as an original of `resource` in a group still valid;
 * - `issuedRefs()`: every ref the model was shown, in order;
 * - `issuedRefsIn(resource)`: those read in that resource (tab) only, none for an unknown one -- the only refs a step's
 *   refusal may offer, since a ref read in another tab can never witness a press in this one (t791 fix 2); absent, `issuedRefs()`;
 * - `sealed()`: no further read can become an original (absent, false);
 * - `here()`: the refs of the latest read, so a creation's refusal can say which lists were read on this page;
 * - `explored()`: the acts this build explored, every brief's in a project build.
 */
export type AutomationStudioSiteResetAdmissionKnown = {
  unissued(reference: unknown): boolean;
  destination(declared: AutomationStudioSiteResetAdmissionDeclared, reference: unknown): { ref: string; scope: string; group: string } | undefined;
  original(scope: string, resource: string): { scope: string; group: string } | undefined;
  /** Project control admission needs actual pre-act counts, never a declaration's current state alone. */
  controlOriginal?: (control: AutomationStudioSiteResetAdmissionDeclared["control"]) => boolean;
  controlOriginalCanBeRead?: (control: AutomationStudioSiteResetAdmissionDeclared["control"]) => boolean;
  issuedRefs(): readonly AutomationStudioSiteResetIssuedRef[];
  issuedRefsIn?(resource: string | undefined): readonly AutomationStudioSiteResetIssuedRef[];
  sealed?(): boolean;
  here(): readonly string[];
  explored(): ReadonlyArray<AutomationStudioSiteResetAdmissionExplored>;
};

/** The refusal evidence every site-reset refusal carries (`../reset-answers/refusal.ts`). */
export type AutomationStudioSiteResetAdmissionRefusal = { ok: false; code: `candidate.${string}`; failed: AutomationStudioSiteResetFailed; canMeet: AutomationStudioSiteResetCanMeet; condition: string; instruction: string };

/** Admitted, with its witness where it is a reversible scoped press (none where its own policy applies), or refused. */
export type AutomationStudioSiteResetAdmissionVerdict =
  | { kind: "admit"; witness?: AutomationStudioSiteResetWitness }
  | { kind: "refused"; evidence: AutomationStudioSiteResetAdmissionRefusal };
