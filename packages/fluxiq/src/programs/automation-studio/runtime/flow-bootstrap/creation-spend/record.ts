// What a Flow's creation has spent so far, kept between its builds.
//
// **One purse per Flow creation (t234).** The person's limit is a Flow's:
// $0.10 (FLUXIQ_LLM_RUN_COST_CEILING_USD, or the Flow's lower setting) for
// creating it. A creation runs from its first build until a Flow is proposed
// or a build ends "not doable", and every build in between -- a continuation
// after a budget ending, its repairs, its tests and its judges -- draws from
// that one ceiling (`../../llm/build-purse/purse.ts`). A build's purse lives
// only as long as the build, so what it spent is written here however the
// build ends, and the next build of the same Flow opens its purse with it
// (`carriedUsd`). Without this record building again started a fresh ceiling,
// and a Flow nobody could build could be paid for without end.
//
// It is held in a store of its own beside the Flow
// (`runtime/service/creation-spend.ts`), and deleted when the creation ends --
// except in a Lab-scoped run (`FLUXIQ_LLM_RUN_COST_CEILING_SCOPE=test`), where
// it is the Flow's whole purse (t438; the user, 2026-10-01: "bring the ceiling
// down to $0.1 per flow max"): it outlives the creation, the run's repair opens
// its purse with it and writes its own spend back
// (`runtime/service/runtime-adaptation/flow-spend.ts`). Outside the Lab a
// repair keeps its own per-run ceiling and never reads or writes it.
//
// **Itemised in a Lab-scoped run (t728).** The Flow's purse held dollars and a
// build count only, so the Lab rebuilt which part of the Flow spent what from
// the step log. Every addition to the Flow's purse now names its phase
// (`./phases.ts`, `./phase-of.ts`) and how many calls it was, and the record
// keeps `calls` and `byPhase` beside `spentUsd`. A record written by the
// per-creation path outside the Lab, or before this, has neither; one that
// was already holding spend when itemising began has a `byPhase` summing to
// less than `spentUsd`, by what it held unitemised.
//
// **Largest input and agent roles (t728).** The same addition carries the
// settled call's reported input tokens and the agent role its step-log scope
// names (`supervisor`, `builder`, `repair`, `validator`, as the step log writes
// `role`), so the record also keeps `largestInputTokens` -- how big one call's
// context grew -- and `byRole`, a project build's spend per agent. A call made
// by no named agent (a single-agent build, a run, the chat) is in no role. A
// record from before this reads back with both `null`.
import type { AUTOMATION_STUDIO_FLOW_SPEND_PHASES } from "./phases.ts";

/** One part of a Flow's life its spend is itemised by. */
export type AutomationStudioFlowSpendPhase = (typeof AUTOMATION_STUDIO_FLOW_SPEND_PHASES)[number];

/** What one phase spent: settled provider calls (priced chat attempts for `chat`) and their charge in US dollars. */
export type AutomationStudioFlowSpendItem = { calls: number; usd: number };

export type AutomationStudioFlowBootstrapCreationSpend = {
  kind: "flow_creation_spend";
  projectId: string;
  flowId: string;
  /** What every build of this creation has spent, in US dollars, as the build's purse counted it. */
  spentUsd: number;
  /** Builds of this creation that have ended, counting from 1. */
  builds: number;
  createdAt: number;
  updatedAt: number;
  /** Every call the itemised record counted, all phases summed. Present exactly beside `byPhase`. */
  calls?: number;
  /** The Flow's spend by phase, every phase present. Present only on a record a Lab-scoped Flow purse added to. */
  byPhase?: Record<AutomationStudioFlowSpendPhase, AutomationStudioFlowSpendItem>;
  /** The most input tokens any one itemised call reported; `null` when none reported a count, or on a record from before it was kept. */
  largestInputTokens?: number | null;
  /** The itemised calls by the agent role that made them; a call no agent named is in none. `null` on a record from before it was kept. */
  byRole?: Record<string, AutomationStudioFlowSpendItem> | null;
};
