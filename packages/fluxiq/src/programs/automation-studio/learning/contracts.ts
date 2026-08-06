import type { JsonObject } from "../../../core/index.ts";
import type { AutomationCondition, EvidenceReference, PolicyAction } from "../model/index.ts";
import type { SignalMiningResult } from "../mining/index.ts";

export type LearningUncertainty = {
  id: string;
  question: string;
  severity: "blocking" | "important" | "minor";
  evidence: EvidenceReference[];
  metadata?: JsonObject;
};

export type LearnedEffect = {
  signalPath: string;
  condition: AutomationCondition;
  probability: number;
  evidence: EvidenceReference[];
  metadata?: JsonObject;
};

export type LearnedActionCluster = {
  id: string;
  label: string;
  actionTemplate: PolicyAction;
  positiveRequirements: AutomationCondition[];
  negativeRequirements: AutomationCondition[];
  expectedEffects: LearnedEffect[];
  possibleSideEffects: LearnedEffect[];
  confidence: number;
  sourceOccurrences: string[];
  metadata?: JsonObject;
};

export type LearnedTransition = {
  id: string;
  fromClusterId: string;
  toClusterId: string;
  probability: number;
  evidence: EvidenceReference[];
  metadata?: JsonObject;
};

export type LearnedTaskModel = {
  schemaVersion: "0.1";
  learnedTaskModelId: string;
  taskId: string;
  version: string;
  actionClusters: LearnedActionCluster[];
  transitions: LearnedTransition[];
  invariants: AutomationCondition[];
  unresolvedQuestions: LearningUncertainty[];
  sourceRecordings: string[];
  sourceMiningRuns: string[];
  generatedAt: number;
  metadata?: JsonObject;
};

export type TaskModelLearner = {
  learn(taskId: string, miningResults: SignalMiningResult[]): Promise<LearnedTaskModel> | LearnedTaskModel;
};
