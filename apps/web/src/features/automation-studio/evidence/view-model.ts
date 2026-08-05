"use client";

import { conditionSummary, readableObjectSummary, readableToken, timelineEntrySummary, timelineEntryTitle } from "../timeline/view-model";

export type EvidenceSignalViewModel = {
  id: string;
  title: string;
  kind: string;
  relation: string;
  timing: string;
  summary: string;
  before: string;
  after: string;
  value: string;
  supportCount: number;
  claimIds: string[];
  sourceEntryIds: string[];
};

export type ProposalStepViewModel = {
  id: string;
  label: string;
  description: string;
  actions: string[];
  requirements: string[];
  expectedEffects: string[];
  evidence: EvidenceSignalViewModel[];
  confidence: string;
  occurrenceCount: number;
  transition?: string;
};

export type TimelineEvidenceViewModel = {
  selectedMoment: {
    title: string;
    summary: string;
    type: string;
    source: string;
    offset: string;
    event: string;
    recordedData: Array<[string, string]>;
  } | null;
  signals: EvidenceSignalViewModel[];
  proposalUsage: Array<{
    proposalId: string;
    stepId: string;
    stepLabel: string;
    summary: string;
    signalCount: number;
  }>;
};

export type ProposalViewModel = {
  title: string;
  source: string;
  status: string;
  generated: string;
  summary: string;
  steps: ProposalStepViewModel[];
  rawStepCount: number;
  evidenceCount: number;
};

export function buildTimelineEvidenceViewModel(input: {
  artifacts: any;
  entry: any;
  recording: any;
  timeline: any;
}): TimelineEvidenceViewModel {
  const entry = input.entry;
  const recordingId = input.recording?.recordingId;
  const timelineId = input.timeline?.normalizedTimelineId;
  const evidence = collectEvidenceArtifacts(input.artifacts, recordingId, timelineId);
  const entryId = entry?.id;
  const facts = evidence.facts.filter((fact) => !entryId || fact.source?.entryId === entryId);
  const factIds = new Set(facts.map((fact) => fact.factId));
  const observations = evidence.observations.filter((observation) => observation.factIds?.some((factId: string) => factIds.has(factId)));
  const observationIds = new Set(observations.map((observation) => observation.observationId));
  const correlations = evidence.correlations.filter((correlation) => correlation.actionEntryId === entryId || correlation.support?.some((support: any) => support.entryId === entryId));
  const correlationIds = new Set(correlations.map((correlation) => correlation.correlationId));
  const claims = evidence.claims.filter((claim) =>
    claim.factIds?.some((factId: string) => factIds.has(factId)) ||
    claim.observationIds?.some((observationId: string) => observationIds.has(observationId)) ||
    claim.sourceEvidence?.some((source: any) => correlationIds.has(source.artifactId) || source.entryId === entryId)
  );
  const signals = buildEvidenceSignals({ observations, correlations, claims });
  const signalIds = new Set(signals.flatMap((signal) => [signal.id, ...signal.claimIds]));
  const proposalUsage = evidence.proposals.flatMap((proposal: any) => (proposal.policy?.nodes ?? [])
    .filter((node: any) => node.sourceEvidence?.some((source: any) => signalIds.has(source.artifactId)))
    .map((node: any) => ({
      proposalId: proposal.proposalId,
      stepId: node.id,
      stepLabel: node.label ?? node.id,
      summary: node.description ?? actionListSummary(node.actions),
      signalCount: node.sourceEvidence?.filter((source: any) => signalIds.has(source.artifactId)).length ?? 0
    })));
  return {
    selectedMoment: entry ? {
      title: timelineEntryTitle(entry),
      summary: timelineEntrySummary(entry),
      type: readableToken(entry.type ?? "entry"),
      source: entry.sourceId ?? "unknown",
      offset: `${entry.monotonicOffsetMs ?? 0}ms`,
      event: entry.eventType ?? entry.actionType ?? "-",
      recordedData: Object.entries(flatObject(entry.payload ?? entry.data ?? entry.state ?? entry.diff ?? entry.target ?? {}))
        .slice(0, 10)
        .map(([key, value]) => [readableToken(key), valueSummary(value)])
    } : null,
    signals,
    proposalUsage
  };
}

export function buildProposalViewModel(input: {
  artifacts: any;
  proposal: any;
  recording: any;
}): ProposalViewModel | null {
  const proposal = input.proposal;
  if (!proposal) return null;
  const recordingId = input.recording?.recordingId ?? proposal.metadata?.recordingId;
  const evidence = collectEvidenceArtifacts(input.artifacts, recordingId, null);
  const allSignals = buildEvidenceSignals({ observations: evidence.observations, correlations: evidence.correlations, claims: evidence.claims });
  const signalsById = new Map(allSignals.flatMap((signal) => [[signal.id, signal], ...signal.claimIds.map((claimId) => [claimId, signal] as const)]));
  const nodes = proposal.policy?.nodes ?? [];
  const edges = proposal.policy?.edges ?? [];
  const rawSteps = nodes.map((node: any): ProposalStepViewModel => {
    const sourceIds: string[] = (node.sourceEvidence ?? []).map((source: any) => source.artifactId).filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
    const nodeEvidence = uniqueById(sourceIds.map((id) => signalsById.get(id)).filter(Boolean) as EvidenceSignalViewModel[]);
    const edge = edges.find((candidate: any) => candidate.fromNodeId === node.id);
    const step: ProposalStepViewModel = {
      id: node.id,
      label: node.label ?? node.id,
      description: node.description ?? "Generated from mined recording evidence.",
      actions: (node.actions ?? []).map((action: any) => readableToken(action.actionType ?? "action")),
      requirements: summarizeConditions(node.eligibility),
      expectedEffects: summarizeConditions(node.successConditions),
      evidence: nodeEvidence,
      confidence: typeof node.generatedMetadata?.confidence === "number" ? `${Math.round(node.generatedMetadata.confidence * 100)}%` : "-",
      occurrenceCount: 1
    };
    if (edge) step.transition = `${edge.label ?? "Next"} -> ${nodeLabel(nodes, edge.toNodeId)}${typeof edge.probability === "number" ? ` (${Math.round(edge.probability * 100)}%)` : ""}`;
    return step;
  });
  const steps = collapseRepeatedProposalSteps(rawSteps);
  return {
    title: readableProposalTitle(proposal.policy?.taskId ?? proposal.proposalId),
    source: input.recording ? input.recording.metadata?.name ?? readableRecordingId(input.recording.recordingId) : readableRecordingId(recordingId),
    status: proposal.status ?? "proposed",
    generated: proposal.generatedAt ? new Date(proposal.generatedAt).toLocaleString() : "-",
    summary: `${steps.length} unique task step${steps.length === 1 ? "" : "s"} proposed from ${rawSteps.length} recorded action/effect item${rawSteps.length === 1 ? "" : "s"}.`,
    steps,
    rawStepCount: rawSteps.length,
    evidenceCount: uniqueById(steps.flatMap((step: ProposalStepViewModel) => step.evidence)).length
  };
}

function collectEvidenceArtifacts(artifacts: any, recordingId?: string, timelineId?: string | null) {
  const miningRuns = (artifacts?.miningRuns ?? []).filter((run: any) => {
    if (!recordingId && !timelineId) return true;
    return run.metadata?.recordingId === recordingId || run.normalizedTimelineId === timelineId;
  });
  return {
    facts: mergeRows(artifacts?.evidenceFacts ?? [], miningRuns.flatMap((run: any) => run.facts ?? []), "factId").filter((item) => matchesScope(item, recordingId, timelineId)),
    observations: mergeRows(artifacts?.evidenceObservations ?? [], miningRuns.flatMap((run: any) => run.observations ?? []), "observationId").filter((item) => matchesScope(item, recordingId, timelineId)),
    correlations: mergeRows(artifacts?.stateActionCorrelations ?? [], miningRuns.flatMap((run: any) => run.correlations ?? []), "correlationId").filter((item) => matchesScope(item, recordingId, timelineId)),
    claims: mergeRows(artifacts?.evidenceClaims ?? [], miningRuns.flatMap((run: any) => run.claims ?? []), "claimId").filter((item) => matchesScope(item, recordingId, timelineId)),
    proposals: (artifacts?.policyProposals ?? []).filter((item: any) => !recordingId || item.metadata?.recordingId === recordingId)
  };
}

function buildEvidenceSignals(input: { observations: any[]; correlations: any[]; claims: any[] }): EvidenceSignalViewModel[] {
  const claimsByCorrelation = new Map<string, any[]>();
  for (const claim of input.claims) {
    for (const source of claim.sourceEvidence ?? []) {
      if (!claimsByCorrelation.has(source.artifactId)) claimsByCorrelation.set(source.artifactId, []);
      claimsByCorrelation.get(source.artifactId)!.push(claim);
    }
  }
  const correlationSignals = input.correlations.map((correlation) => {
    const claims = claimsByCorrelation.get(correlation.correlationId) ?? [];
    return {
      id: correlation.correlationId,
      title: correlation.descriptor?.label ?? readableStatePath(correlation.statePath),
      kind: readableToken(correlation.elementKind ?? "state"),
      relation: readableToken(correlation.relation ?? "related"),
      timing: correlationTiming(correlation),
      summary: correlationSummary(correlation),
      before: valueSummary(correlation.before),
      after: valueSummary(correlation.after),
      value: valueSummary(correlation.after ?? correlation.before),
      supportCount: correlation.support?.length ?? 0,
      claimIds: claims.map((claim) => claim.claimId),
      sourceEntryIds: uniqueStrings([correlation.actionEntryId, ...(correlation.support ?? []).map((source: any) => source.entryId)])
    };
  });
  const observationSignals = input.observations
    .filter((observation) => !correlationSignals.some((signal) => signal.sourceEntryIds.some((entryId) => observation.metadata?.entryId === entryId)))
    .map((observation) => {
      const claims = input.claims.filter((claim) => claim.observationIds?.includes(observation.observationId));
      return {
        id: observation.observationId,
        title: observation.title ?? readableToken(observation.kind ?? "signal"),
        kind: readableToken(observation.subject?.type ?? observation.kind ?? "signal"),
        relation: readableToken(observation.kind ?? "observed"),
        timing: "Recorded at selected moment",
        summary: observation.summary ?? readableObjectSummary(observation.subject),
        before: valueSummary(observation.before),
        after: valueSummary(observation.after),
        value: valueSummary(observation.after ?? observation.before ?? observation.subject),
        supportCount: observation.factIds?.length ?? 0,
        claimIds: claims.map((claim) => claim.claimId),
        sourceEntryIds: []
      };
    });
  return [...correlationSignals, ...observationSignals];
}

function summarizeConditions(group: any): string[] {
  const conditions = group?.conditions ?? [];
  if (!conditions.length) return [];
  return uniqueStrings(conditions
    .map((condition: any) => condition.signalPath
      ? `${readableStatePath(condition.signalPath)} ${readableToken(condition.operator ?? "exists")}`
      : conditionSummary(condition))
    .filter((item: string) => item && item !== "-" && item !== "condition: empty" && !item.endsWith(": empty")))
    .slice(0, 4);
}

function nodeLabel(nodes: any[], nodeId: string): string {
  return nodes.find((node) => node.id === nodeId)?.label ?? nodeId;
}

function actionListSummary(actions: any[]): string {
  return actions?.map((action) => readableToken(action.actionType ?? "action")).join(", ") || "Generated task action.";
}

function collapseRepeatedProposalSteps(steps: ProposalStepViewModel[]): ProposalStepViewModel[] {
  const grouped = new Map<string, ProposalStepViewModel>();
  for (const step of steps) {
    const key = [
      step.label,
      step.actions.join("|"),
      step.requirements.join("|"),
      step.expectedEffects.join("|"),
      step.evidence.map((signal) => signal.title).join("|")
    ].join("::");
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...step, evidence: uniqueById(step.evidence) });
      continue;
    }
    grouped.set(key, {
      ...existing,
      evidence: uniqueById([...existing.evidence, ...step.evidence]),
      occurrenceCount: existing.occurrenceCount + step.occurrenceCount
    });
  }
  return [...grouped.values()];
}

function readableProposalTitle(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "Generated Proposal";
  if (text.startsWith("client.extension-")) return "Generated Proposal";
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function readableRecordingId(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "Unknown recording";
  if (text.startsWith("client.extension-")) return `Recording ${text.split(".").slice(-1)[0] ?? ""}`.trim();
  return text;
}

function correlationSummary(correlation: any): string {
  const label = correlation.descriptor?.label ?? readableStatePath(correlation.statePath);
  if (String(correlation.relation ?? "").includes("after")) return `${label} changed after the recorded action.`;
  return `${label} was available around the recorded action.`;
}

function correlationTiming(correlation: any): string {
  if (correlation.timing?.afterMs !== undefined) return `${correlation.timing.afterMs}ms after action`;
  if (correlation.timing?.beforeMs !== undefined) return `${correlation.timing.beforeMs}ms before action`;
  return "Around action";
}

function mergeRows(primary: any[], secondary: any[], idKey: string): any[] {
  const seen = new Set<string>();
  const rows: any[] = [];
  for (const row of [...primary, ...secondary]) {
    const id = String(row?.[idKey] ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push(row);
  }
  return rows;
}

function matchesScope(item: any, recordingId?: string, timelineId?: string | null): boolean {
  if (recordingId && item.recordingId && item.recordingId !== recordingId) return false;
  if (timelineId && item.normalizedTimelineId && item.normalizedTimelineId !== timelineId) return false;
  return true;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  return output;
}

function uniqueStrings(items: unknown[]): string[] {
  return [...new Set(items.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

function readableStatePath(pathValue: string): string {
  return String(pathValue ?? "").split(".").filter(Boolean).map(readableToken).join(" / ") || "-";
}

export function valueSummary(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? value.map(valueSummary).join(", ") : "[]";
  if (typeof value === "object") {
    const typed = value as Record<string, unknown>;
    if ("value" in typed && Object.keys(typed).length <= 6) return valueSummary(typed.value);
    const flat = Object.entries(flatObject(value)).slice(0, 4).map(([key, item]) => `${readableToken(key)}: ${valueSummary(item)}`);
    return flat.length ? flat.join("; ") : "{}";
  }
  return String(value);
}

function flatObject(value: unknown, prefix = ""): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === "object" && !Array.isArray(item) && !("value" in (item as Record<string, unknown>))) {
      Object.assign(output, flatObject(item, path));
    } else {
      output[path] = item;
    }
  }
  return output;
}
