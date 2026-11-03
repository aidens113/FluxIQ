import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioRouteSignatures } from "../../../../runtime/automation-host/route-state/index.ts";
import type { AutomationStudioSiteResetWitnessStamp } from "../index.ts";
import type { AutomationStudioFlowBootstrapNodeMetadata } from "./metadata.ts";

export type AutomationStudioFlowBootstrapNode = {
  key: string;
  definitionId: string;
  definitionVersion: string;
  parameters?: JsonObject;
  outputActionId?: string;
  /**
   * What this step's own action would lastingly do, in the permission gate's
   * classes, as the step declared it.
   *
   * Kept as plain strings on purpose: the vocabulary belongs to
   * `runtime/action-permissions/`, which reads it fail-closed, so nothing here
   * has to learn a word of it. `[]` is a step saying it causes nothing lasting;
   * absent is a step that said nothing at all, and the two are not the same
   * answer.
   */
  consequences?: string[];
  /**
   * The pages the step ran between as the build saw them -- `before`, its
   * expected pre-state, and `after` -- each the host's opaque signature of a
   * route state (`../../route-state/signatures/`). Core-derived only: set
   * from the build's draft, dropped from a plan the model wrote, and written
   * to the Flow node's metadata under `routeSignatures` (`../adaptation.ts`).
   */
  routeSignatures?: AutomationStudioRouteSignatures;
  /**
   * What the Flow node is named: its draft step's described name, in the
   * domain's words (R3-U-12). Core-derived only, as `routeSignatures` is, and
   * written to the Flow node's `label`, which a run's step card shows
   * (`../adaptation.ts`, `../../activity/step/`).
   */
  label?: string;
  /**
   * The least time, in whole milliseconds, between two starts of this node in
   * one run (t378): a span's `repeat pace:` on its first step, or the larger
   * pace a judged trial learned, which promotion keeps
   * (`../../service/candidate-trial/promotion.ts`). Written to the Flow node's
   * `metadata.paceMs` (`../adaptation.ts`), which every graph run honours
   * (`../../executor/pacing/`). Bounded by
   * `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS` (`./limits.ts`).
   */
  paceMs?: number;
  /**
   * What this step's reversible lasting act is witnessed by (t751, R3 door 2):
   * the stamp Core's one admission (`../reset-admission/`) answered when the
   * domain put the step's declaration to the build's permission check at
   * submission (`../../llm/harness-options/plan-parameter-resolution.ts`).
   * Core-derived only: never read from what a model wrote (a script line or a
   * JSON-plan field of this name is refused or dropped), accepted here only in
   * the exact stamp form (`automationStudioSiteResetWitnessStampValid`), and
   * written to the Flow node's metadata (`../adaptation.ts`), from which each
   * trial act of the step takes it. Absent where the step is not a reversible
   * lasting act, or no witness was found for it.
   */
  resetWitness?: AutomationStudioSiteResetWitnessStamp;
  /**
   * Where a run may begin or come back to this node, as the state-aware
   * recovery contract stores it on the Flow node (C2): `fluxiq.entry`, an
   * alternative entry a script's `start at:` declared, and `fluxiq.checkpoint`,
   * a step a script marked `checkpoint: yes`, which a handler's `go to` may
   * route to. Core-derived from the script (`../script-statements/`), never
   * from a model's JSON plan, and written to the Flow node's metadata under
   * the same keys.
   */
  metadata?: AutomationStudioFlowBootstrapNodeMetadata;
};
