import type { AutomationStudioSubflowCard } from "@fluxiq/contracts/automation";

/** What the model is shown of one part of this project's library: the card, less what it cannot use. */
export type AutomationStudioKnownPart = {
  /** Copied exactly into `core.run_part`. */
  partId: string;
  version: number;
  name: string;
  purpose: string;
  sites: string[];
  inputs: AutomationStudioSubflowCard["inputs"];
  outputs: AutomationStudioSubflowCard["outputs"];
  /** What the part does to exactly this, whatever a run is given. */
  fixedValues: string[];
  lastingClasses: AutomationStudioSubflowCard["lastingClasses"];
  trust: AutomationStudioSubflowCard["trust"]["tier"];
};

/** The shortlist as evidence: Core's one-line note, and the parts. */
export type AutomationStudioKnownParts = { note: string; parts: AutomationStudioKnownPart[] };

/** A part that may fit, in the order the library found it: where its words ranked, when they did. */
export type AutomationStudioKnownPartCandidate = { card: AutomationStudioSubflowCard; textRank?: number | undefined };
