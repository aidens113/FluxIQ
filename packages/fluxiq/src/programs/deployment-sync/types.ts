import type { JsonObject } from "../../core/index.ts";

export type DeploymentSyncStatus = "idle" | "syncing" | "synced" | "failed";
export type DeploymentRunMode = "dry-run" | "sync" | "rollback";

export type DeploymentTarget = {
  id: string;
  name: string;
  environment: string;
  status: DeploymentSyncStatus;
  lastSyncAtMs?: number;
  metadata?: JsonObject;
};

export type DeploymentArtifact = {
  id: string;
  targetId: string;
  kind: "config" | "policy" | "program" | "domain" | "data";
  version: string;
  checksum?: string;
  metadata?: JsonObject;
};

export type DeploymentSyncRun = {
  id: string;
  targetId: string;
  status: DeploymentSyncStatus;
  mode?: DeploymentRunMode;
  versionSha?: string;
  startedAtMs: number;
  finishedAtMs?: number;
  message?: string;
  plan?: string[];
};

export type DeploymentGitBranch = {
  name: string;
  current: boolean;
  remote: boolean;
  upstream?: string;
  sha?: string;
};

export type DeploymentGitVersion = {
  sha: string;
  shortSha: string;
  author: string;
  committedAtMs: number;
  refs: string[];
  message: string;
};

export type DeploymentGitSnapshot = {
  rootDir: string;
  available: boolean;
  currentBranch?: string;
  headSha?: string;
  dirty: boolean;
  status: string[];
  branches: DeploymentGitBranch[];
  versions: DeploymentGitVersion[];
  remotes: Array<{ name: string; url: string; direction: "fetch" | "push" }>;
  error?: string;
};

export type DeploymentSyncSnapshot = {
  targets: DeploymentTarget[];
  artifacts: DeploymentArtifact[];
  runs: DeploymentSyncRun[];
  git?: DeploymentGitSnapshot;
};
