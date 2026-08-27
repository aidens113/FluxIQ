"use client";

import { useCallback, useEffect, useState } from "react";
import type { DeploymentGitVersion, DeploymentSyncRun, DeploymentSyncSnapshotResponse } from "fluxiq/deployment-sync";
import { useProgramApi, type ApiResponse } from "../program-api";
import { DataTable, Field, KeyValue, Modal, Panel, Segmented, StatusText, SummaryStrip, VisualAlert } from "../shared-ui";
import { formatTime, yesNo } from "./shared";


export function DeploymentSyncLive() {
  const api = useProgramApi("deployment-sync");
  const [snapshot, setSnapshot] = useState<ApiResponse<DeploymentSyncSnapshotResponse> | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [selectedRun, setSelectedRun] = useState<DeploymentSyncRun | { version: DeploymentGitVersion } | null>(null);
  const [historyTab, setHistoryTab] = useState<"versions" | "git" | "branches" | "actions">("versions");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ endpoint: "sync" | "rollback"; targetId: string; versionSha?: string } | null>(null);
  const refresh = useCallback(async () => setSnapshot(await api.get<DeploymentSyncSnapshotResponse>("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  const targets = snapshot?.payload?.targets ?? [];
  const git = snapshot?.payload?.git;
  const activeTarget = targets.find((item) => item.id === selectedTargetId) ?? targets[0];

  async function run(endpoint: "dry-run" | "sync" | "rollback", targetId: string, versionSha?: string) {
    setBusy(true);
    const result = await api.post<DeploymentSyncRun>(endpoint, versionSha ? { targetId, versionSha } : { targetId });
    setBusy(false);
    setSelectedRun(result.payload ?? null);
    setStatus(result.ok ? `${endpoint} finished` : result.error ?? "Deployment action failed");
    await refresh();
  }

  return (
    <section className="deployment-sync-shell">
      <Panel title="Repository Sync" action={<button className="button" onClick={refresh} type="button">Refresh</button>}>
        <SummaryStrip items={[["Branches", git?.branches?.length ?? targets.length], ["Current", git?.currentBranch ?? "-"], ["Working Tree", git?.dirty ? "Dirty" : "Clean"], ["Actions", snapshot?.payload?.runs?.length ?? 0]]} />
        {git?.available ? <KeyValue rows={[["Repo root", git.rootDir], ["HEAD", git.headSha ?? "-"], ["Remotes", String(git.remotes?.length ?? 0)], ["Status rows", String(git.status?.length ?? 0)]]} /> : <VisualAlert tone="error" title="Git unavailable" message={git?.error ?? "The importing project root is not a git repository."} />}
      </Panel>
      <Panel title="Branch Action">
        <div className="field-row dense-fields"><Field label="Branch target"><select value={activeTarget?.id ?? ""} onChange={(event) => setSelectedTargetId(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{item.name}{item.metadata?.current ? " (current)" : ""}</option>)}</select></Field></div>
        {activeTarget ? <KeyValue rows={[["Branch", String(activeTarget.metadata?.branch ?? activeTarget.name)], ["Type", activeTarget.environment], ["Status", activeTarget.status], ["SHA", String(activeTarget.metadata?.sha ?? "-")]]} /> : null}
        {git?.dirty ? <VisualAlert tone="warning" title="Working tree has local changes" message="Git will refuse unsafe branch changes. Commit, stash, or clean local changes before syncing to another branch." /> : null}
        <div className="inline-actions"><button className="button" disabled={!activeTarget || !git?.available || busy} onClick={() => activeTarget && void run("dry-run", activeTarget.id)} type="button">Dry Run</button><button className="button button-primary" disabled={!activeTarget || !git?.available || busy} onClick={() => activeTarget && setPendingAction({ endpoint: "sync", targetId: activeTarget.id })} type="button">Checkout Branch</button></div>
      </Panel>
      <Panel title="All Branches">
        <DataTable columns={["Branch", "Type", "Current", "Status", "SHA"]} rows={targets.map((item) => [<button className="link-button" onClick={() => setSelectedTargetId(item.id)} type="button">{item.name}</button>, item.environment, yesNo(item.metadata?.current), item.status, String(item.metadata?.sha ?? "-").slice(0, 12)])} />
      </Panel>
      <Panel title="History / Result">
        <Segmented value={historyTab} onChange={(value) => setHistoryTab(value as "versions" | "git" | "branches" | "actions")} options={["versions", "git", "branches", "actions"]} />
        {historyTab === "versions" ? <DataTable columns={["Version", "Refs", "Author", "Committed", "Message", "Rollback"]} rows={(git?.versions ?? []).map((version) => [
          <button className="link-button" onClick={() => setSelectedRun({ version })} type="button">{version.shortSha || String(version.sha).slice(0, 8)}<small>{String(version.sha).slice(0, 12)}</small></button>,
          version.refs?.length ? version.refs.join(", ") : "-",
          version.author,
          formatTime(version.committedAtMs),
          version.message,
          <button className="button" disabled={!activeTarget || !git?.available || busy} onClick={() => activeTarget && setPendingAction({ endpoint: "rollback", targetId: activeTarget.id, versionSha: version.sha })} type="button">Rollback</button>
        ])} empty="No git versions discovered." /> : null}
        {historyTab === "git" ? <div className="git-state-panel">
          <DataTable columns={["Remote", "Direction", "URL"]} rows={(git?.remotes ?? []).map((remote) => [remote.name, remote.direction, remote.url])} empty="No git remotes configured." />
          {git?.status?.length ? <details className="json-details" open><summary>Working tree status</summary><pre>{git.status.join("\n")}</pre></details> : <VisualAlert tone="success" title="Working tree clean" message="No local changes detected." />}
        </div> : null}
        {historyTab === "branches" ? <DataTable columns={["Branch", "Current", "Remote", "Upstream", "SHA"]} rows={(git?.branches ?? []).map((branch) => [branch.name, yesNo(branch.current), yesNo(branch.remote), branch.upstream ?? "-", String(branch.sha ?? "-").slice(0, 12)])} empty="No branches discovered." /> : null}
        {historyTab === "actions" ? <DataTable columns={["Run", "Target", "Mode", "Status", "Message"]} rows={(snapshot?.payload?.runs ?? []).map((run) => [<button className="link-button" onClick={() => setSelectedRun(run)} type="button">{run.id.slice(0, 8)}</button>, run.targetId, run.mode ?? "-", run.status, run.message ?? "-"])} /> : null}
        {selectedRun ? <DeploymentResultDetail value={selectedRun} /> : null}
        <StatusText value={busy ? "Deployment action in progress..." : status} />
      </Panel>
      {pendingAction ? <Modal title={pendingAction.endpoint === "rollback" ? "Confirm Rollback" : "Confirm Branch Checkout"} description={pendingAction.endpoint === "rollback" ? "Rollback changes the selected target to version " + pendingAction.versionSha + "." : "Checkout updates the importing repository to the selected branch. Local changes may block the operation."} onClose={() => setPendingAction(null)}><VisualAlert tone="warning" title="Repository state will change" message="Review the target and working-tree status before continuing." /><KeyValue rows={[["Target", pendingAction.targetId], ["Action", pendingAction.endpoint], ["Version", pendingAction.versionSha ?? "Selected branch"]]} /><div className="modal-actions"><button className="button" onClick={() => setPendingAction(null)} type="button">Cancel</button><button className="button button-primary" onClick={() => { const action = pendingAction; setPendingAction(null); void run(action.endpoint, action.targetId, action.versionSha); }} type="button">{pendingAction.endpoint === "rollback" ? "Rollback" : "Checkout"}</button></div></Modal> : null}
    </section>
  );
}

function DeploymentResultDetail({ value }: { value: DeploymentSyncRun | { version: DeploymentGitVersion } }) {
  if ("version" in value) return <section className="deployment-result-detail"><h3>Selected Version</h3><KeyValue rows={[["SHA", value.version.sha], ["Author", value.version.author], ["Committed", formatTime(value.version.committedAtMs)], ["Refs", value.version.refs.join(", ") || "-"], ["Message", value.version.message]]} /></section>;
  return <section className="deployment-result-detail"><h3>Selected Action</h3><KeyValue rows={[["Run ID", value.id], ["Target", value.targetId], ["Mode", value.mode ?? "-"], ["Status", value.status], ["Started", formatTime(value.startedAtMs)], ["Finished", formatTime(value.finishedAtMs)], ["Message", value.message ?? "-"]]} />{value.plan?.length ? <ol>{value.plan.map((step) => <li key={step}>{step}</li>)}</ol> : null}</section>;
}
