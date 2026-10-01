"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FluxIQRuntimeRun } from "fluxiq/runtime";
import { EmptyState, KeyValue, LoadingState, VisualAlert } from "../../components";
import { useProgramApi } from "../../program-api";
import { projectRuntimeSnapshot } from ".";

type Row = NonNullable<ReturnType<typeof projectRuntimeSnapshot>>["runs"][number];

export function RuntimeRunDetail(props: { run: Row; scope: object; attempts: Row[] }) {
  const api = useProgramApi("runtime");
  const [detail, setDetail] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const activeRef = useRef(false);
  const ownerRef = useRef({ api, id: props.run.id, scope: props.scope });
  const load = useCallback(async () => {
    if (!activeRef.current || ownerRef.current.api !== api || ownerRef.current.id !== props.run.id || ownerRef.current.scope !== props.scope) return;
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    const request = ++requestRef.current;
    setLoading(true); setError(""); setDetail(null);
    try {
      const result = await api.post<FluxIQRuntimeRun>("get-run", { runId: props.run.id }, { signal: controller.signal });
      if (controller.signal.aborted || request !== requestRef.current) return;
      const projected = result.ok ? projectRuntimeSnapshot({ runtimeId: "detail", clients: [], capabilities: [], adapters: [], transports: [], commandAttempts: [], runs: [result.payload] })?.runs[0] : null;
      if (!projected || projected.id !== props.run.id) setError("Run detail could not be confirmed. The snapshot summary may be stale. Retry to check this run.");
      else setDetail(projected);
    } catch { if (!controller.signal.aborted && request === requestRef.current) setError("Run detail could not be loaded. Retry to check this run."); }
    finally { if (!controller.signal.aborted && request === requestRef.current) setLoading(false); }
  }, [api, props.run.id, props.scope]);
  useEffect(() => {
    activeRef.current = true; ownerRef.current = { api, id: props.run.id, scope: props.scope };
    void load();
    return () => { activeRef.current = false; ++requestRef.current; controllerRef.current?.abort(); };
  }, [load]);
  const currentOwner = ownerRef.current.api === api && ownerRef.current.id === props.run.id && ownerRef.current.scope === props.scope;
  const visibleDetail = currentOwner ? detail : null;
  const visibleError = currentOwner ? error : "";
  const visibleLoading = !currentOwner || loading;
  return <section aria-label="Runtime run detail" aria-busy={visibleLoading}>
    <h3>{visibleDetail ? "Confirmed run detail" : "Snapshot run summary"}</h3>
    {visibleLoading ? <LoadingState compact label="Loading current run detail" /> : null}
    {visibleError ? <><VisualAlert tone="error" title="Run detail unavailable" message={visibleError} /><button type="button" className="button" onClick={() => void load()}>Retry run detail</button></> : null}
    <KeyValue rows={(visibleDetail ?? props.run).values} />
    <h4>Recorded dispatch paths</h4>
    {props.attempts.length ? props.attempts.slice(0, 50).map((attempt) => <details key={attempt.key}><summary>{attempt.id}: {attempt.status}</summary><KeyValue rows={attempt.values} /></details>) : <EmptyState compact title="No dispatch paths recorded" description="The returned snapshot has no related command attempts for this run." />}
    {props.attempts.length > 50 ? <p>Showing the newest 50 of {props.attempts.length} recorded attempts. Use Dispatch to inspect additional entries.</p> : null}
  </section>;
}
