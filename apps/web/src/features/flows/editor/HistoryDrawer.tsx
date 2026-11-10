"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { loadHistory } from "../data";
import { historyRows, type HistoryRow } from "../model";
import { freshId, restorePayload } from "../requests";
import { useLoaded } from "../use-loaded";
import { restoreAnswer } from "../wire";

/**
 * The Flow's saved versions, who saved each and why, newest first. Restore is one press: it is
 * saved as a new version and every version stays here, so nothing is lost and no grant is asked.
 */
export function HistoryDrawer(props: {
  studio: ProgramCommandTransport;
  flow: { projectId: string; flowId: string };
  currentRevision: number;
  onClose(): void;
  onRestored(revision: number, from: number): void;
}) {
  const { studio, flow } = props;
  const history = useLoaded(`${flow.flowId}@${props.currentRevision}`, useCallback((signal: AbortSignal) => loadHistory(studio, flow, signal), [studio, flow]));
  const [restoring, setRestoring] = useState<number>();
  const [problem, setProblem] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const restore = async (row: HistoryRow & { snapshotSha256: string }) => {
    setRestoring(row.revisionNumber);
    setProblem(undefined);
    const answer = restoreAnswer(await studio.post("restore-graph-snapshot", restorePayload(flow, row, freshId())));
    setRestoring(undefined);
    if (answer.kind === "restored") return props.onRestored(answer.revision, row.revisionNumber);
    if (answer.kind === "conflict") {
      setProblem("This Flow changed while the versions were open, so nothing was restored. The list is up to date now; try again.");
      return history.reload();
    }
    setProblem(answer.reason);
  };
  const rows = history.state === "ready" ? historyRows(history.data, props.currentRevision, Date.now()) : [];
  return (
    <aside className="flows-drawer" aria-labelledby="flows-history-heading" aria-busy={history.state === "loading"}>
      <div className="flows-drawer-head">
        <h2 id="flows-history-heading" ref={heading} tabIndex={-1}>Versions</h2>
        <button type="button" className="flows-tool" onClick={props.onClose}>Close versions</button>
      </div>
      {history.state === "loading" ? <p className="flows-note">Loading the versions…</p> : null}
      {history.state === "error" ? <p className="flows-note flows-error" role="alert">The versions could not be loaded: {history.message} <button type="button" onClick={history.reload}>Try again</button></p> : null}
      {problem ? <p className="flows-refusal" role="alert">{problem}</p> : null}
      {rows.length ? (
        <ol className="flows-versions">
          {rows.map((row) => (
            <li key={row.revisionNumber} className="flows-version" data-current={row.current || undefined}>
              <div className="flows-version-main">
                <strong>{row.title}{row.current ? " (now)" : ""}</strong>
                <span>{row.who} · {row.when}</span>
                <span className="flows-muted">{row.why}</span>
              </div>
              {row.snapshotSha256 ? (
                <button type="button" className="flows-button" disabled={restoring !== undefined} aria-label={`Restore ${row.title}`} onClick={() => void restore({ ...row, snapshotSha256: row.snapshotSha256 ?? "" })}>
                  {restoring === row.revisionNumber ? "Restoring…" : "Restore"}
                </button>
              ) : row.current ? null : <span className="flows-muted">Cannot be restored</span>}
            </li>
          ))}
        </ol>
      ) : null}
    </aside>
  );
}
