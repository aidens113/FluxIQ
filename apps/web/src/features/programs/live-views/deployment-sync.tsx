"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DeploymentGitVersion, DeploymentSyncRun, DeploymentSyncSnapshotResponse } from "fluxiq/deployment-sync";
import { useProgramApi, type ApiResponse } from "../program-api";
import { DataTable, EmptyState, Field, KeyValue, LoadingState, Modal, Panel, Segmented, StatusText, SummaryStrip, VisualAlert } from "../shared-ui";
import { formatTime, yesNo } from "./shared";


export function DeploymentSyncLive() {
  const api = useProgramApi("deployment-sync");
  const owner = useRef({ api, id: 0 });
  if (owner.current.api !== api) owner.current = { api, id: owner.current.id + 1 };
  const scope = owner.current;
  return <DeploymentWorkspace key={scope.id} api={api} isOwner={() => owner.current === scope} />;
}

type PendingAction = { endpoint: "sync" | "rollback"; targetId: string; versionSha?: string; epoch: number };
function DeploymentWorkspace({ api, isOwner }: { api: ReturnType<typeof useProgramApi>; isOwner(): boolean }) {
  const [snapshot, setSnapshot] = useState<ApiResponse<DeploymentSyncSnapshotResponse> | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [selectedRun, setSelectedRun] = useState<DeploymentSyncRun | { version: DeploymentGitVersion } | null>(null);
  const [historyTab, setHistoryTab] = useState<"versions" | "git" | "branches" | "actions">("versions");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [readError, setReadError] = useState("");
  const [reading, setReading] = useState(false);
  const mounted = useRef(false);
  const currentOwner = useRef(isOwner); currentOwner.current = isOwner;
  const alive = useCallback(() => mounted.current && currentOwner.current(), []);
  const actionLock = useRef(false);
  const confirmation = useRef<PendingAction | null>(null);
  const confirmationEpoch = useRef(0);
  const latestSnapshot = useRef<DeploymentSyncSnapshotResponse | null>(null);
  const read = useRef<{ id: number; controller: AbortController; promise: Promise<void> } | null>(null);
  const readEpoch = useRef(0);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; readEpoch.current++; read.current?.controller.abort(); read.current = null; confirmation.current = null; }; }, []);
  const refresh = useCallback((): Promise<void> => {
    if (!alive()) return Promise.resolve();
    if (read.current) return read.current.promise;
    const id = ++readEpoch.current; const controller = new AbortController();
    setReading(true); setReadError("");
    const promise = Promise.resolve().then(async () => {
      if (!alive() || controller.signal.aborted || id !== readEpoch.current) return;
      try {
        const result = await api.get<DeploymentSyncSnapshotResponse>("snapshot", { signal: controller.signal });
        if (!alive() || controller.signal.aborted || id !== readEpoch.current) return;
        if (!result.ok || !validSnapshot(result.payload)) throw new Error("invalid snapshot");
        latestSnapshot.current = result.payload;
        setSnapshot({ ok: true, payload: result.payload });
        setSelectedTargetId((selected) => result.payload!.targets.some((target) => target.id === selected) ? selected : result.payload!.targets[0]?.id ?? "");
        setSelectedRun((selected) => selected && "version" in selected && !result.payload!.git?.versions.some((version) => version.sha === selected.version.sha) ? null : selected);
        const pending = confirmation.current;
        if (pending && !availableAction(result.payload, pending)) { confirmation.current = null; setPendingAction(null); setStatus("The selected target or version is no longer available."); }
      } catch {
        if (alive() && !controller.signal.aborted && id === readEpoch.current) { setReadError("Snapshot refresh failed. Retry to confirm repository state."); if (!latestSnapshot.current) setSnapshot({ ok: false }); }
      } finally {
        if (alive() && id === readEpoch.current) { read.current = null; setReading(false); }
      }
    });
    read.current = { id, controller, promise }; return promise;
  }, [alive, api]);
  useEffect(() => { void refresh(); }, [refresh]);
  const targets = snapshot?.payload?.targets ?? [];
  const git = snapshot?.payload?.git;
  const activeTarget = targets.find((item) => item.id === selectedTargetId) ?? targets[0];

  function openConfirmation(action: Omit<PendingAction, "epoch">) {
    if (!alive() || actionLock.current || !availableAction(latestSnapshot.current, action)) return;
    const pending = { ...action, epoch: ++confirmationEpoch.current }; confirmation.current = pending; setPendingAction(pending);
  }
  function closeConfirmation(action: PendingAction) {
    if (!alive() || confirmation.current !== action || actionLock.current) return;
    confirmation.current = null; setPendingAction(null);
  }
  function confirmAction(action: PendingAction) {
    if (!alive() || confirmation.current !== action || actionLock.current) return;
    confirmation.current = null; setPendingAction(null); void run(action.endpoint, action.targetId, action.versionSha);
  }

  async function run(endpoint: "dry-run" | "sync" | "rollback", targetId: string, versionSha?: string) {
    if (!alive() || actionLock.current || !availableAction(latestSnapshot.current, { endpoint, targetId, ...(versionSha ? { versionSha } : {}) })) return;
    actionLock.current = true; setBusy(true); setStatus("");
    readEpoch.current++; read.current?.controller.abort(); read.current = null; setReading(false);
    try {
      const result = await api.post<DeploymentSyncRun>(endpoint, versionSha ? { targetId, versionSha } : { targetId });
      if (!alive()) return;
      if (!result.ok || !validRun(result.payload) || result.payload.targetId !== targetId || (result.payload.mode !== undefined && result.payload.mode !== endpoint)) { setStatus("Deployment action failed. Review the target before trying again."); return; }
      setSelectedRun(result.payload); setStatus(`${endpoint} finished`); await refresh();
    } catch {
      if (alive()) setStatus("Deployment action failed. Review the target before trying again.");
    } finally {
      if (alive()) { actionLock.current = false; setBusy(false); }
    }
  }

  if (!snapshot) return <LoadingState label="Loading Deployment Sync" detail="Inspecting repository, branches, versions, and recent deployment actions." />;
  if (!snapshot.ok) return <EmptyState title="Deployment Sync unavailable" description={readError || "Repository deployment state could not be loaded."} action={<button className="button" disabled={reading} onClick={() => void refresh()} type="button">Retry</button>} />;

  return (
    <section className="deployment-sync-shell">
      <Panel title="Repository Sync" action={<button className="button" disabled={reading || busy} onClick={() => { if (!actionLock.current) void refresh(); }} type="button">Refresh</button>}>
        {readError ? <VisualAlert tone="error" title="Snapshot refresh failed" message={readError} /> : null}
        {readError ? <button className="button" disabled={reading || busy} onClick={() => { if (!actionLock.current) void refresh(); }} type="button">Retry</button> : null}
        {reading ? <p role="status">Refreshing repository state...</p> : null}
        <SummaryStrip items={[["Branches", git?.branches?.length ?? targets.length], ["Current", git?.currentBranch ?? "-"], ["Working Tree", git?.available ? (git.dirty ? "Dirty" : "Clean") : "Unknown"], ["Actions", snapshot?.payload?.runs?.length ?? 0]]} />
        {git?.available ? <KeyValue rows={[["Repo root", git.rootDir], ["HEAD", git.headSha ?? "-"], ["Remotes", String(git.remotes?.length ?? 0)], ["Status rows", String(git.status?.length ?? 0)]]} /> : <VisualAlert tone="error" title="Git unavailable" message={git?.error ?? "The importing project root is not a git repository."} />}
      </Panel>
      <Panel title="Branch Action">
        {!targets.length ? <EmptyState compact title="No deployment targets" description="Register a deployment target before checking out or rolling back a branch." /> : null}
        <div className="field-row dense-fields"><Field label="Branch target"><select value={activeTarget?.id ?? ""} onChange={(event) => setSelectedTargetId(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{item.name}{item.metadata?.current ? " (current)" : ""}</option>)}</select></Field></div>
        {activeTarget ? <KeyValue rows={[["Branch", String(activeTarget.metadata?.branch ?? activeTarget.name)], ["Type", activeTarget.environment], ["Status", activeTarget.status], ["SHA", String(activeTarget.metadata?.sha ?? "-")]]} /> : null}
        {git?.dirty ? <VisualAlert tone="warning" title="Working tree has local changes" message="Git will refuse unsafe branch changes. Commit, stash, or clean local changes before syncing to another branch." /> : null}
        <div className="inline-actions"><button className="button" disabled={!activeTarget || !git?.available || busy} onClick={() => activeTarget && void run("dry-run", activeTarget.id)} type="button">Dry Run</button><button className="button button-primary" disabled={!activeTarget || !git?.available || busy} onClick={() => activeTarget && openConfirmation({ endpoint: "sync", targetId: activeTarget.id })} type="button">Checkout Branch</button></div>
      </Panel>
      <Panel title="All Branches">
        <DataTable label="Deployment branch targets" columns={["Branch", "Type", "Current", "Status", "SHA"]} rows={targets.map((item) => [<button className="link-button" onClick={() => setSelectedTargetId(item.id)} type="button">{item.name}</button>, item.environment, yesNo(item.metadata?.current), item.status, String(item.metadata?.sha ?? "-").slice(0, 12)])} empty="No deployment targets are registered." />
      </Panel>
      <Panel title="History / Result">
        <Segmented value={historyTab} onChange={(value) => setHistoryTab(value as "versions" | "git" | "branches" | "actions")} options={["versions", "git", "branches", "actions"]} />
        {historyTab === "versions" ? <DataTable label="Repository versions" columns={["Version", "Refs", "Author", "Committed", "Message", "Rollback"]} rows={(git?.versions ?? []).map((version) => [
          <button className="link-button" onClick={() => setSelectedRun({ version })} type="button">{version.shortSha || String(version.sha).slice(0, 8)}<small>{String(version.sha).slice(0, 12)}</small></button>,
          version.refs?.length ? version.refs.join(", ") : "-",
          version.author,
          formatTime(version.committedAtMs),
          version.message,
          <button className="button" disabled={!activeTarget || !git?.available || busy} onClick={() => activeTarget && openConfirmation({ endpoint: "rollback", targetId: activeTarget.id, versionSha: version.sha })} type="button">Rollback</button>
        ])} empty="No git versions discovered." /> : null}
        {historyTab === "git" ? <div className="git-state-panel">
          <DataTable label="Git remotes" columns={["Remote", "Direction", "URL"]} rows={(git?.remotes ?? []).map((remote) => [remote.name, remote.direction, remote.url])} empty="No git remotes configured." />
          {git?.status?.length ? <details className="json-details" open><summary>Working tree status</summary><pre>{git.status.join("\n")}</pre></details> : git?.available && !git.dirty ? <VisualAlert tone="success" title="Working tree clean" message="No local changes detected." /> : <VisualAlert tone="warning" title="Working tree state unavailable" message="Refresh repository state before deciding on a branch action." />}
        </div> : null}
        {historyTab === "branches" ? <DataTable label="Git branches" columns={["Branch", "Current", "Remote", "Upstream", "SHA"]} rows={(git?.branches ?? []).map((branch) => [branch.name, yesNo(branch.current), yesNo(branch.remote), branch.upstream ?? "-", String(branch.sha ?? "-").slice(0, 12)])} empty="No branches discovered." /> : null}
        {historyTab === "actions" ? <DataTable label="Deployment actions" columns={["Run", "Target", "Mode", "Status", "Message"]} rows={(snapshot?.payload?.runs ?? []).map((run) => [<button className="link-button" onClick={() => setSelectedRun(run)} type="button">{run.id.slice(0, 8)}</button>, run.targetId, run.mode ?? "-", run.status, run.message ?? "-"])} empty="No deployment actions have run." /> : null}
        {selectedRun ? <DeploymentResultDetail value={selectedRun} /> : null}
        {busy || status ? <p role={status.startsWith("Deployment action failed") ? "alert" : "status"}>{busy ? "Deployment action in progress..." : status}</p> : null}
        <StatusText value={busy ? "Deployment action in progress..." : status} />
      </Panel>
      {pendingAction ? <Modal title={pendingAction.endpoint === "rollback" ? "Confirm Rollback" : "Confirm Branch Checkout"} description={pendingAction.endpoint === "rollback" ? "Rollback changes the selected target to version " + pendingAction.versionSha + "." : "Checkout updates the importing repository to the selected branch. Local changes may block the operation."} onClose={() => closeConfirmation(pendingAction)}><VisualAlert tone="warning" title="Repository state will change" message="Review the target and working-tree status before continuing." /><KeyValue rows={[["Target", pendingAction.targetId], ["Action", pendingAction.endpoint], ["Version", pendingAction.versionSha ?? "Selected branch"]]} /><div className="modal-actions"><button className="button" onClick={() => closeConfirmation(pendingAction)} type="button">Cancel</button><button className="button button-primary" disabled={busy} onClick={() => confirmAction(pendingAction)} type="button">{pendingAction.endpoint === "rollback" ? "Rollback" : "Checkout"}</button></div></Modal> : null}
    </section>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const optionalString = (value: unknown) => value === undefined || typeof value === "string";
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const validStatus = (value: unknown) => typeof value === "string" && ["idle", "syncing", "synced", "failed"].includes(value);
function validRun(value: unknown): value is DeploymentSyncRun {
  return isRecord(value) && typeof value.id === "string" && typeof value.targetId === "string" && validStatus(value.status) && finite(value.startedAtMs)
    && (value.finishedAtMs === undefined || finite(value.finishedAtMs)) && optionalString(value.message) && optionalString(value.versionSha)
    && (value.mode === undefined || ["dry-run", "sync", "rollback"].includes(String(value.mode))) && (value.plan === undefined || strings(value.plan));
}
function validSnapshot(value: unknown): value is DeploymentSyncSnapshotResponse {
  if (!isRecord(value) || !Array.isArray(value.targets) || !Array.isArray(value.runs) || !value.runs.every(validRun)) return false;
  if (!value.targets.every((target) => isRecord(target) && typeof target.id === "string" && typeof target.name === "string" && typeof target.environment === "string" && validStatus(target.status) && (target.metadata === undefined || isRecord(target.metadata)))) return false;
  if (value.git === undefined) return true;
  const git = value.git;
  return isRecord(git) && typeof git.rootDir === "string" && typeof git.available === "boolean" && typeof git.dirty === "boolean"
    && optionalString(git.currentBranch) && optionalString(git.headSha) && optionalString(git.error) && strings(git.status)
    && Array.isArray(git.branches) && git.branches.every((item) => isRecord(item) && typeof item.name === "string" && typeof item.current === "boolean" && typeof item.remote === "boolean" && optionalString(item.upstream) && optionalString(item.sha))
    && Array.isArray(git.remotes) && git.remotes.every((item) => isRecord(item) && typeof item.name === "string" && typeof item.url === "string" && ["fetch", "push"].includes(String(item.direction)))
    && Array.isArray(git.versions) && git.versions.every((item) => isRecord(item) && typeof item.sha === "string" && typeof item.shortSha === "string" && typeof item.author === "string" && typeof item.message === "string" && finite(item.committedAtMs) && strings(item.refs));
}
function availableAction(snapshot: DeploymentSyncSnapshotResponse | null, action: { endpoint: string; targetId: string; versionSha?: string }) {
  return Boolean(snapshot?.git?.available && snapshot.targets.some((target) => target.id === action.targetId) && (action.endpoint !== "rollback" || snapshot.git.versions.some((version) => version.sha === action.versionSha)));
}

function DeploymentResultDetail({ value }: { value: DeploymentSyncRun | { version: DeploymentGitVersion } }) {
  if ("version" in value) return <section className="deployment-result-detail"><h3>Selected Version</h3><KeyValue rows={[["SHA", value.version.sha], ["Author", value.version.author], ["Committed", formatTime(value.version.committedAtMs)], ["Refs", value.version.refs.join(", ") || "-"], ["Message", value.version.message]]} /></section>;
  return <section className="deployment-result-detail"><h3>Selected Action</h3><KeyValue rows={[["Run ID", value.id], ["Target", value.targetId], ["Mode", value.mode ?? "-"], ["Status", value.status], ["Started", formatTime(value.startedAtMs)], ["Finished", formatTime(value.finishedAtMs)], ["Message", value.message ?? "-"]]} />{value.plan?.length ? <ol>{value.plan.map((step) => <li key={step}>{step}</li>)}</ol> : null}</section>;
}
