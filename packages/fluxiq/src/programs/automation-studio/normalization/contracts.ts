import type { NormalizedTimeline as CanonicalNormalizedTimeline, TimelineNormalizer as CanonicalTimelineNormalizer } from "@fluxiq/contracts/recording";
import type { ActionTarget } from "../model/index.ts";
import type { EvidenceReference } from "../model/index.ts";
export type { NormalizationIssueSeverity, NormalizationIssue, CheckpointPolicy, NormalizationOptions } from "@fluxiq/contracts/recording";
export type NormalizedTimeline = CanonicalNormalizedTimeline<ActionTarget, EvidenceReference>;
export type TimelineNormalizer = CanonicalTimelineNormalizer<ActionTarget, EvidenceReference>;
