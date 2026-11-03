import type { JsonObject } from "../../../core/index.ts";
import type { StateBounds, StatePath } from "./state.ts";

export type AutomationStudioElementTargetSource = "recording" | "runtime" | "mapper" | "operator" | "inferred";

/** Persisted interchange: browser fields round-trip as opaque domain evidence.
 * Core never supplies browser scoring; the registered domain matcher owns their meaning. */
export type AutomationStudioElementTargetFingerprint = {
  visibleText?: string;
  accessibleName?: string;
  label?: string;
  id?: string;
  testId?: string;
  automationId?: string;
  entityId?: string;
  entityKind?: string;
  tagName?: string;
  role?: string;
  selector?: string;
  xpath?: string;
  queryPath?: string;
  statePath?: string | StatePath;
  url?: string;
  classNames?: string[];
  bounds?: StateBounds;
  attributes?: Record<string, string>;
  /**
   * An opaque digest of what a control draws, written by the domain that
   * captured it (a web domain hashes an icon's geometry, for one). Core keeps it
   * so a stored or repaired target loses none of the identity it was saved
   * with, and never reads, scores or compares it: only the domain that wrote it
   * knows what it means. The domain normalizer bounds the persisted token.
   */
  drawing?: string;
  metadata?: JsonObject;
};

export type AutomationStudioElementTargetCandidate = AutomationStudioElementTargetFingerprint & {
  candidateId: string;
  visualFrameId?: string;
  visualLayerId?: string;
  isVisibleOnViewport?: boolean;
};

export type AutomationStudioElementTargetSelection = {
  candidateId: string;
  confidence: number;
  matchedSignals: string[];
  failedSignals: string[];
  metadata?: JsonObject;
};

export type AutomationStudioElementTarget = {
  kind: "element";
  fingerprint: AutomationStudioElementTargetFingerprint;
  candidates?: AutomationStudioElementTargetCandidate[];
  selectedCandidate?: AutomationStudioElementTargetSelection;
  source?: AutomationStudioElementTargetSource;
  metadata?: JsonObject;
};

export type AutomationStudioElementTargetValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path: string;
};

export type AutomationStudioElementTargetValidationResult = {
  ok: boolean;
  issues: AutomationStudioElementTargetValidationIssue[];
};
