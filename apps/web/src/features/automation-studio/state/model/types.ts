import type { EvidenceAnchor, NodeEvidenceRole, NodeStatePhase, NodeStateSource, StateSnapshot, StateVisualFrame } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../../shared/selection-contracts";

export type BuildNodeStateViewModelInput = {
  selection: AutomationSelection | null;
  selectedNode: unknown;
  selectedEntry?: unknown;
  selectedProposal?: unknown;
  selectedRecording: unknown;
  selectedTimeline: unknown;
  policy: unknown;
  taskGraph: unknown;
  pipelineArtifacts: unknown;
  recordings: unknown[];
  timelines: unknown[];
  runtimeSessions: unknown[];
  signals: unknown[];
  indexedStateSources?: Array<{ source: NodeStateSource; snapshot: StateSnapshot; raw?: unknown }>;
  viewState?: { sourceId?: string; stateSnapshotId?: string; phase?: NodeStatePhase; selectedEvidenceId?: string; selectedFactPath?: string };
};

export type StateFactViewModel = {
  id: string; namespace: string; path: string; fullPath: string; label: string; value: string; rawValue: unknown;
  observedAt?: number; confidence?: number; anchor?: EvidenceAnchor; source?: string;
};

export type NodeEvidenceBindingViewModel = {
  id: string; nodeId: string; factPath: string; role: NodeEvidenceRole; label: string; comparator: string;
  expectedValue?: string; weight?: number; confidence?: number; anchor?: EvidenceAnchor; provenanceCount: number; selected: boolean;
};

export type StateOverlayTone = "positive" | "weak" | "negative" | "mismatch" | "neutral" | "action-target";
export type StateVisualTone = "control" | "link" | "input" | "text" | "region" | "media" | "navigation" | "list" | "status" | "selected" | "disabled" | "unknown";
export type StateOverlayViewModel = {
  id: string; label: string; role: NodeEvidenceRole; tone: StateOverlayTone; anchor: EvidenceAnchor;
  factPath?: string; evidenceId?: string; confidence?: number; selected?: boolean; visualTone?: StateVisualTone;
};
export type StateStructuredRow = { id: string; namespace: string; path: string; label: string; value: string; type?: string; confidence?: string; source?: string };
export type StateDiffRow = { id: string; path: string; change: string; before: string; after: string; confidence?: string };

export type NodeStateRuntimeComparisonRow = {
  id: string; status: "match" | "mismatch" | "irrelevant"; evidenceId?: string; factPath: string; label: string;
  expected: string; actual: string; score?: number; severity?: "warning" | "error"; anchor?: EvidenceAnchor;
};
export type NodeStateRuntimeComparisonViewModel = {
  expectedSourceId: string; actualSourceId: string; nodeId: string; confidence?: number;
  matches: NodeStateRuntimeComparisonRow[]; mismatches: NodeStateRuntimeComparisonRow[];
  irrelevant: NodeStateRuntimeComparisonRow[]; rows: NodeStateRuntimeComparisonRow[];
};
export type ResolvedActionVisualTargetViewModel = {
  actionEntryId: string; stateSnapshotId?: string; visualFrameId?: string; visualLayerId?: string; anchor?: EvidenceAnchor;
  entityId?: string; entityKind?: string; statePath?: { namespace: string; path: string }; confidence?: number;
  resolution: "exact-layer" | "state-path" | "entity" | "anchor" | "missing"; issues?: string[];
};
export type NodeStateViewModel = {
  title: string; subtitle: string; sources: NodeStateSource[]; activeSource: NodeStateSource | null;
  phases: Array<{ id: NodeStatePhase; label: string; available: boolean }>; activePhase: NodeStatePhase;
  visualFrame?: StateVisualFrame; facts: StateFactViewModel[]; evidence: NodeEvidenceBindingViewModel[];
  overlays: StateOverlayViewModel[]; structuredRows: StateStructuredRow[]; diffRows: StateDiffRow[];
  runtimeComparison?: NodeStateRuntimeComparisonViewModel; actionVisualTarget?: ResolvedActionVisualTargetViewModel;
  raw: unknown;
  summary: { facts: number; evidence: number; strong: number; weak: number; negative: number; ignored: number; matches?: number; mismatches?: number; confidence?: number };
  emptyState?: { title: string; message: string };
};
export type StateSourceRecord = { source: NodeStateSource; snapshot: StateSnapshot | null; deltas: unknown[]; raw: unknown };
