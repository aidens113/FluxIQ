import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ProgramJsonStore, programDataFile } from "../../_shared/storage.ts";
import type { DeploymentArtifact, DeploymentGitBranch, DeploymentGitSnapshot, DeploymentGitVersion, DeploymentRunMode, DeploymentSyncRun, DeploymentSyncSnapshot, DeploymentTarget } from "../types.ts";

const execFileAsync = promisify(execFile);

export type DeploymentSyncProvider = {
  snapshot?(): Promise<Partial<DeploymentSyncSnapshot>> | Partial<DeploymentSyncSnapshot>;
  plan?(target: DeploymentTarget, artifacts: DeploymentArtifact[], mode: DeploymentRunMode, options?: DeploymentRunOptions): Promise<string[]> | string[];
  sync?(target: DeploymentTarget, artifacts: DeploymentArtifact[]): Promise<string | void> | string | void;
  rollback?(target: DeploymentTarget, artifacts: DeploymentArtifact[], options?: DeploymentRunOptions): Promise<string | void> | string | void;
};

export type DeploymentRunOptions = {
  versionSha?: string;
};

type DeploymentSyncState = {
  targets: DeploymentTarget[];
  artifacts: DeploymentArtifact[];
  runs: DeploymentSyncRun[];
};

export class DeploymentSyncService {
  private readonly targets = new Map<string, DeploymentTarget>();
  private readonly artifacts = new Map<string, DeploymentArtifact>();
  private readonly runs = new Map<string, DeploymentSyncRun>();
  private readonly store?: ProgramJsonStore<DeploymentSyncState>;
  private loaded = false;

  constructor(provider?: DeploymentSyncProvider, options: { dataDir?: string; rootDir?: string } = {}) {
    this.provider = provider ?? (options.rootDir ? gitDeploymentProvider(options.rootDir) : localDeploymentProvider());
    if (options.dataDir) {
      this.store = new ProgramJsonStore(programDataFile(options.dataDir, "deployment-sync", "state.json"), () => ({ targets: [], artifacts: [], runs: [] }));
    }
  }

  private readonly provider: DeploymentSyncProvider;

  async upsertTarget(target: DeploymentTarget): Promise<DeploymentTarget> {
    await this.load();
    this.targets.set(target.id, target);
    await this.persist();
    return target;
  }

  async upsertArtifact(artifact: DeploymentArtifact): Promise<DeploymentArtifact> {
    await this.load();
    if (!this.targets.has(artifact.targetId)) {
      throw new Error(`Unknown deployment target: ${artifact.targetId}`);
    }
    this.artifacts.set(artifact.id, artifact);
    await this.persist();
    return artifact;
  }

  async dryRun(targetId: string): Promise<DeploymentSyncRun> {
    return this.execute(targetId, "dry-run");
  }

  async sync(targetId: string): Promise<DeploymentSyncRun> {
    return this.execute(targetId, "sync");
  }

  async rollback(targetId: string, versionSha?: string): Promise<DeploymentSyncRun> {
    return this.execute(targetId, "rollback", Date.now(), versionSha ? { versionSha } : {});
  }

  async snapshot(): Promise<DeploymentSyncSnapshot> {
    await this.load();
    await this.refreshProviderSnapshot();
    return {
      targets: [...this.targets.values()].sort((left, right) => left.name.localeCompare(right.name)),
      artifacts: [...this.artifacts.values()].sort((left, right) => left.id.localeCompare(right.id)),
      runs: [...this.runs.values()].sort((left, right) => right.startedAtMs - left.startedAtMs),
      ...(await this.provider.snapshot?.() ?? {})
    };
  }

  private async execute(targetId: string, mode: DeploymentRunMode, nowMs = Date.now(), options: DeploymentRunOptions = {}): Promise<DeploymentSyncRun> {
    await this.load();
    const target = this.targets.get(targetId);
    if (!target) {
      throw new Error(`Unknown deployment target: ${targetId}`);
    }
    const artifacts = [...this.artifacts.values()].filter((artifact) => artifact.targetId === targetId);
    const run: DeploymentSyncRun = {
      id: randomUUID(),
      targetId,
      status: "syncing",
      mode,
      startedAtMs: nowMs
    };
    if (options.versionSha) run.versionSha = options.versionSha;
    const plan = await this.provider.plan?.(target, artifacts, mode, options);
    if (plan) run.plan = plan;
    this.runs.set(run.id, run);
    this.targets.set(targetId, { ...target, status: "syncing" });
    await this.persist();

    try {
      let message: string | void = undefined;
      if (mode === "sync") message = await this.provider.sync?.(target, artifacts);
      if (mode === "rollback") message = await this.provider.rollback?.(target, artifacts, options);
      const finishedAtMs = Date.now();
      const finished: DeploymentSyncRun = {
        ...run,
        status: "synced",
        finishedAtMs,
        message: message || `${mode} completed`
      };
      this.runs.set(finished.id, finished);
      const syncedTarget: DeploymentTarget = { ...target, status: "synced" };
      if (mode === "sync") syncedTarget.lastSyncAtMs = finishedAtMs;
      else if (target.lastSyncAtMs !== undefined) syncedTarget.lastSyncAtMs = target.lastSyncAtMs;
      this.targets.set(targetId, syncedTarget);
      await this.persist();
      return finished;
    } catch (error) {
      const failed: DeploymentSyncRun = {
        ...run,
        status: "failed",
        finishedAtMs: Date.now(),
        message: error instanceof Error ? error.message : String(error)
      };
      this.runs.set(failed.id, failed);
      this.targets.set(targetId, { ...target, status: "failed" });
      await this.persist();
      return failed;
    }
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.store) {
      this.ensureDefaults();
      return;
    }
    const state = await this.store.read();
    for (const target of state.targets) this.targets.set(target.id, target);
    for (const artifact of state.artifacts) this.artifacts.set(artifact.id, artifact);
    for (const run of state.runs) this.runs.set(run.id, run);
    if (this.ensureDefaults()) {
      await this.persist();
    }
    await this.refreshProviderSnapshot();
  }

  private async refreshProviderSnapshot(): Promise<void> {
    const snapshot = await this.provider.snapshot?.();
    if (!snapshot) return;
    for (const target of snapshot.targets ?? []) this.targets.set(target.id, { ...this.targets.get(target.id), ...target });
    for (const artifact of snapshot.artifacts ?? []) this.artifacts.set(artifact.id, { ...this.artifacts.get(artifact.id), ...artifact });
  }

  private async persist(): Promise<void> {
    if (!this.store) return;
    await this.store.write({
      targets: [...this.targets.values()],
      artifacts: [...this.artifacts.values()],
      runs: [...this.runs.values()].sort((left, right) => right.startedAtMs - left.startedAtMs).slice(0, 500)
    });
  }

  private ensureDefaults(): boolean {
    let changed = false;
    if (this.targets.size === 0) {
      this.targets.set("local-framework", {
        id: "local-framework",
        name: "Local Framework Runtime",
        environment: "local",
        status: "idle"
      });
      changed = true;
    }
    if (this.artifacts.size === 0) {
      this.artifacts.set("framework-runtime", {
        id: "framework-runtime",
        targetId: "local-framework",
        kind: "config",
        version: "local"
      });
      changed = true;
    }
    return changed;
  }
}

function localDeploymentProvider(): DeploymentSyncProvider {
  return {
    plan: (_target, artifacts, mode) => [
      `${mode} target`,
      `inspect ${artifacts.length} artifact(s)`,
      mode === "dry-run" ? "no files will be changed" : "record deployment result"
    ],
    sync: (target, artifacts) => `Synced ${artifacts.length} artifact(s) to ${target.name}`,
    rollback: (target) => `Rollback recorded for ${target.name}`
  };
}

function gitDeploymentProvider(rootDir: string): DeploymentSyncProvider {
  return {
    async snapshot() {
      const git = await gitSnapshot(rootDir);
      const targets = git.branches.map((branch): DeploymentTarget => ({
        id: branchTargetId(branch.name),
        name: branch.name,
        environment: branch.remote ? "remote branch" : "local branch",
        status: branch.current ? "synced" : "idle",
        metadata: {
          branch: branch.name,
          current: branch.current,
          remote: branch.remote,
          upstream: branch.upstream ?? "",
          sha: branch.sha ?? ""
        }
      }));
      const artifacts: DeploymentArtifact[] = [{
        id: "git-working-tree",
        targetId: targets.find((target) => Boolean(target.metadata?.current))?.id ?? targets[0]?.id ?? "git-working-tree",
        kind: "program",
        version: git.headSha ?? "unknown",
        metadata: {
          rootDir,
          currentBranch: git.currentBranch ?? "",
          dirty: git.dirty
        }
      }];
      return { targets, artifacts, git };
    },
    async plan(target, _artifacts, mode, options) {
      const branch = String(target.metadata?.branch ?? "");
      const git = await gitSnapshot(rootDir);
      return [
        `Repository: ${git.rootDir}`,
        `Current branch: ${git.currentBranch ?? "unknown"}`,
        `Target branch: ${branch || "unknown"}`,
        ...(options?.versionSha ? [`Target version: ${options.versionSha}`] : []),
        `Working tree: ${git.dirty ? "dirty" : "clean"}`,
        mode === "sync" ? `Checkout ${branch}` : mode === "rollback" && options?.versionSha ? `Checkout version ${options.versionSha}` : mode === "rollback" ? "Select a version to rollback" : "No branch checkout will be performed"
      ];
    },
    async sync(target) {
      const branch = String(target.metadata?.branch ?? "");
      if (!branch) throw new Error("Deployment target does not define a git branch");
      const before = await gitSnapshot(rootDir);
      if (before.currentBranch === branch) return `Already on ${branch}`;
      await git(rootDir, ["checkout", branch]);
      const after = await gitSnapshot(rootDir);
      return `Checked out ${branch} at ${after.headSha ?? "unknown sha"}`;
    },
    async rollback(target, _artifacts, options) {
      if (!options?.versionSha) return `Rollback for ${target.name} needs a selected version.`;
      await git(rootDir, ["checkout", options.versionSha]);
      const after = await gitSnapshot(rootDir);
      return `Rolled back to ${options.versionSha.slice(0, 12)} at ${after.headSha ?? "unknown sha"}`;
    }
  };
}

async function gitSnapshot(rootDir: string): Promise<DeploymentGitSnapshot> {
  const base: DeploymentGitSnapshot = {
    rootDir,
    available: false,
    dirty: false,
    status: [],
    branches: [],
    versions: [],
    remotes: []
  };
  try {
    await git(rootDir, ["rev-parse", "--git-dir"]);
    const [currentBranch, headSha, status, branches, versions, remotes] = await Promise.all([
      git(rootDir, ["branch", "--show-current"]).catch(() => ""),
      git(rootDir, ["rev-parse", "HEAD"]).catch(() => ""),
      git(rootDir, ["status", "--short"]).catch(() => ""),
      git(rootDir, ["branch", "--all", "--verbose", "--no-abbrev"]).catch(() => ""),
      git(rootDir, ["log", "--all", "--max-count=100", "--pretty=format:%H%x09%h%x09%an%x09%at%x09%D%x09%s"]).catch(() => ""),
      git(rootDir, ["remote", "-v"]).catch(() => "")
    ]);
    base.available = true;
    const currentBranchValue = currentBranch.trim();
    const headShaValue = headSha.trim();
    if (currentBranchValue) base.currentBranch = currentBranchValue;
    if (headShaValue) base.headSha = headShaValue;
    base.status = status.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
    base.dirty = base.status.length > 0;
    base.branches = parseBranches(branches, base.currentBranch);
    base.versions = parseVersions(versions);
    base.remotes = parseRemotes(remotes);
    return base;
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function git(rootDir: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: rootDir, windowsHide: true, maxBuffer: 1024 * 1024 });
  return result.stdout;
}

function parseBranches(output: string, currentBranch?: string): DeploymentGitBranch[] {
  const branches = new Map<string, DeploymentGitBranch>();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const current = trimmed.startsWith("*");
    const value = trimmed.replace(/^\*\s*/, "");
    if (value.includes(" -> ")) continue;
    const remote = value.startsWith("remotes/");
    const withoutRemotePrefix = value.replace(/^remotes\//, "");
    const parts = withoutRemotePrefix.split(/\s+/);
    const rawName = parts[0] ?? "";
    if (!rawName) continue;
    const branchName = remote ? rawName.replace(/^[^/]+\//, "") : rawName;
    if (!branchName || branchName === "HEAD") continue;
    const sha = parts.find((part) => /^[a-f0-9]{7,40}$/i.test(part));
    const existing = branches.get(branchName);
    const branch: DeploymentGitBranch = {
      name: branchName,
      current: existing?.current || current || branchName === currentBranch,
      remote: existing?.remote || remote
    };
    const upstream = remote ? rawName : existing?.upstream;
    const branchSha = existing?.sha ?? sha;
    if (upstream) branch.upstream = upstream;
    if (branchSha) branch.sha = branchSha;
    branches.set(branchName, branch);
  }
  return [...branches.values()].sort((left, right) => Number(right.current) - Number(left.current) || left.name.localeCompare(right.name));
}

function parseRemotes(output: string): DeploymentGitSnapshot["remotes"] {
  return output.split(/\r?\n/).map((line) => {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match) return null;
    return { name: match[1] ?? "", url: match[2] ?? "", direction: (match[3] ?? "fetch") as "fetch" | "push" };
  }).filter((remote): remote is DeploymentGitSnapshot["remotes"][number] => Boolean(remote?.name && remote.url));
}

function parseVersions(output: string): DeploymentGitVersion[] {
  return output.split(/\r?\n/).map((line) => {
    const [sha = "", shortSha = "", author = "", timestamp = "0", refs = "", message = ""] = line.split("\t");
    if (!sha) return null;
    return {
      sha,
      shortSha,
      author,
      committedAtMs: Number(timestamp) * 1000,
      refs: refs.split(",").map((ref) => ref.trim()).filter(Boolean),
      message
    };
  }).filter((version): version is DeploymentGitVersion => Boolean(version));
}

function branchTargetId(branch: string): string {
  return `branch:${branch.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_")}`;
}
