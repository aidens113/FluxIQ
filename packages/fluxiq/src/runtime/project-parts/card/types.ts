// The shapes a saved part's card is derived from and to. A card is what a person
// and the model read about a part; its snapshot is what a run reads. The card
// holds no page text and no page address (the contract refuses what it can see,
// and the derivation never reads a field that holds page words); the snapshot
// holds the part's graph as saved, which does.
import type { AutomationStudioAttemptActClass, AutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFactCondition } from "../../automation-host/contracts/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../flows/authoring/model/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";

/** The parts of a graph Flow a card is read from. */
export type AutomationStudioPartGraph = Pick<AutomationStudioFlowArtifact, "nodes" | "edges" | "interface"> & { metadata?: JsonObject | undefined };

/** A card as stored: the contract's card without trust, which is derived whenever the card is read and never kept. */
export type AutomationStudioStoredPartCard = Omit<AutomationStudioSubflowCard, "trust">;

/** A part another part calls, by what the caller's step names it with: a Subflow id, or `partId@version` for a pin on the library. */
export type AutomationStudioPartCallee = {
  partId: string;
  version: number;
  shapeHash: string;
  lastingClasses: readonly AutomationStudioAttemptActClass[];
  sites: readonly string[];
};

export type AutomationStudioPartCardInput = {
  partId: string;
  /** From 1. The store assigns the version it writes; this is the one the card is checked as. */
  version?: number | undefined;
  graph: AutomationStudioPartGraph;
  /** The Subflow record's own name and description. */
  subflowName: string;
  subflowDescription?: string | undefined;
  /** What a person wrote for this part (`part <label>: <what it does>`, or their own words for it). These win. */
  words?: { name?: string | undefined; purpose?: string | undefined } | undefined;
  /** The person's request, as they wrote it. Only ever compared with, never stored. */
  requestWords: string;
  /** Where the build started. Only its origin is read. */
  startLocation?: string | undefined;
  /** The parameters that name a step's control, from the domain's implementation bundle. Default: `target`. */
  controlParameterKeys?: readonly string[] | undefined;
  /** The words a person would call a control by, read from its target by the domain. Default: none, so no control text is listed or compared. */
  targetWords?: ((target: Record<string, unknown>) => readonly string[]) | undefined;
  /** The parts this one calls, by the Subflow id or `partId@version` its call steps name. */
  callees?: Readonly<Record<string, AutomationStudioPartCallee>> | undefined;
};

/** Where a part may start, and what proves it can. The runner refuses a part whose `source` is `none`. */
export type AutomationStudioPartStartRecord = {
  source: "entry" | "first_step" | "navigate" | "none";
  conditions: AutomationStudioFactCondition[];
  /** The first step navigates to a literal address on the part's site, so the part brings its own page. */
  selfArrives?: true;
};

/** What a version's snapshot holds. The graph is as saved, so it holds page evidence; nothing searched or shown reads it. */
export type AutomationStudioPartSnapshot = {
  schemaVersion: "automation-studio.project-part.v1";
  graph: { interface: AutomationStudioPartGraph["interface"]; nodes: AutomationStudioFlowNode[]; edges: AutomationStudioPartGraph["edges"]; metadata?: JsonObject };
  start: AutomationStudioPartStartRecord;
  end: { conditions: AutomationStudioFactCondition[] };
};

/** The words a full-text index holds for a version, and nothing else. */
export type AutomationStudioPartSearchable = { name: string; purpose: string; ports: string[] };

/** The exact filters a version is found by. */
export type AutomationStudioPartFacetValues = { site: string[]; input: string[]; output: string[]; lasting: string[] };

/** Why a part did not enter the library. Stable codes. */
export type AutomationStudioPartSkipReason =
  | "part.name_unusable"
  | "part.port_unusable"
  | "part.contract_unreadable"
  | "part.no_acting_step"
  | "part.fixed_value_unusable"
  | "part.secret_shaped_value"
  | "part.fixed_value_from_request"
  | "part.unclassified_step"
  | "part.unreadable_consequences"
  | "part.unresolved_call"
  | "part.card_invalid";

export type AutomationStudioPartCardResult =
  | {
    card: AutomationStudioStoredPartCard;
    snapshot: AutomationStudioPartSnapshot;
    searchable: AutomationStudioPartSearchable;
    facets: AutomationStudioPartFacetValues;
    /** Each call step, by node: what the part's `calls` and its call rows are written from. */
    callSites: { nodeId: string; partId: string; version: number }[];
  }
  | { skipped: AutomationStudioPartSkipReason; detail?: string };
