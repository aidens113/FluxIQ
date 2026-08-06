"use client";

import { BookOpen, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, CloudUpload, Copy, Database, FileText, FolderOpen, GitBranch, KeyRound, Play, PlayCircle, QrCode, RefreshCcw, ShieldCheck, Square, TimerReset, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { ComputeControlSnapshotResponse } from "fluxiq/compute-control";
import { useProgramApi, type ApiResponse, type JsonObject } from "../program-api";
import { DataTable, Field, KeyValue, Modal, Panel, Segmented, SpecDatum, StatusBadge, StatusText, SummaryStrip, VisualAlert, type AlertTone } from "../shared-ui";
import type { CurrentUser } from "../types";
import { buildDocumentationTree, copyText, csv, digits, docRouteKey, docsLinkCandidates, emptyCredentialEdit, flattenRunLogs, formatCountdown, formatDbCell, formatDuration, formatTime, isSensitiveDatabaseStore, normalizeDocPath, parseJsonObject, resolveDocsLink, sandboxedDocumentationHtml, scheduleProgress, sensitiveStoreKey, shortJson, shouldCollapseDocsFolder, titleFromRouteSegment, yesNo, type DocsTreeNode } from "./shared";


export function ComputeControlLive() {
  const api = useProgramApi("compute-control");
  const [snapshot, setSnapshot] = useState<ApiResponse<ComputeControlSnapshotResponse> | null>(null);
  const refresh = useCallback(async () => setSnapshot(await api.get<ComputeControlSnapshotResponse>("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  const nodes = snapshot?.payload?.nodes ?? [];
  const totalCapabilities = new Set(nodes.flatMap((node) => node.capabilities ?? [])).size;
  const totalDomains = new Set(nodes.flatMap((node) => node.domainIds ?? [])).size;

  return (
    <section className="program-workspace-grid">
      <Panel title="Compute Summary" action={<button className="button" onClick={refresh} type="button">Refresh</button>}>
        <SummaryStrip items={[["Connected Compute", nodes.filter((node) => node.status !== "offline").length], ["CPU Threads", nodes.reduce((total, node) => total + Number(node.metadata?.cpu_count ?? 0), 0)], ["Capabilities", totalCapabilities], ["Known Domains", totalDomains]]} />
      </Panel>
      <Panel title="Compute Nodes">
        <div className="compute-card-grid">
          {nodes.map((node) => (
            <article className="operator-card compute-card-v1" key={node.id}>
              <header>
                <div><strong>{node.label || node.id}</strong><span>{node.host || node.id}</span></div>
                <StatusBadge value={node.status} />
              </header>
              <div className="spec-grid">
                <SpecDatum label="CPU Threads" value={String(node.metadata?.cpu_count ?? "Unknown")} />
                <SpecDatum label="OS" value={String(node.metadata?.os ?? "Unknown")} />
                <SpecDatum label="Architecture" value={String(node.metadata?.architecture ?? "Unknown")} />
                <SpecDatum label="Version" value={String(node.metadata?.version ?? "Unknown")} />
                <SpecDatum label="Heartbeat" value={formatTime(node.lastHeartbeatMs)} />
                <SpecDatum label="Capabilities" value={node.capabilities.join(", ") || "None"} />
              </div>
              <div className="compute-account-strip">{node.domainIds?.length ? node.domainIds.map((domainId: string) => <span key={domainId}>{domainId}</span>) : <small>No domains assigned</small>}</div>
            </article>
          ))}
          {!nodes.length ? <p className="muted-text">No compute connected.</p> : null}
        </div>
      </Panel>
    </section>
  );
}

