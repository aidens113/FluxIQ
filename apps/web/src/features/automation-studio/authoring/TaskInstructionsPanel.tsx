"use client";

import { useEffect, useRef, useState } from "react";
import type { ProgramCommandTransport } from "../data/program-transport";
import { saveTaskInstruction } from "./save-task-instruction";

/** Explicit task authority, independent of model configuration and existing graph contents. */
export function TaskInstructionsPanel(props: { projectId: string | null; flowId: string; commands: Pick<ProgramCommandTransport, "post">; onSaved?(): void }) {
  const transport = props.commands;
  const [instructionId, setInstructionId] = useState<string | undefined>();
  const [body, setBody] = useState("");
  const [recordings, setRecordings] = useState<{ recordingId: string; description?: string; endedAt?: number; status?: string }[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [linked, setLinked] = useState<string[]>([]);
  const [taskLoaded, setTaskLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const ticket = ++generation.current;
    setInstructionId(undefined);
    setBusy(false);
    setOffset(0);
    setTotal(0);
    setBody("");
    setLinked([]);
    setTaskLoaded(false);
    setStatus("");
    setError("");
    setRecordings([]);
    if (!props.projectId || !props.flowId) return;
    setLoading(true);
    const scope = { projectId: props.projectId, flowId: props.flowId };
    void Promise.all([
      transport.post<{ ready?: boolean; instructionIds?: string[] }>("get-flow-instruction-readiness", scope),
      transport.post<{ recordings?: { recordingId: string; description?: string; endedAt?: number; status?: string }[]; page?: { total?: number } }>("list-recordings", { projectId: props.projectId, summaries: true, limit: 100, offset: 0 })
    ]).then(async ([readiness, evidence]) => {
      if (generation.current !== ticket) return;
      if (!readiness.ok || !evidence.ok) throw new Error(readiness.error || evidence.error || "Could not load task instructions and supporting recordings.");
      setTotal(evidence.payload?.page?.total ?? 0);
      setRecordings((evidence.payload?.recordings ?? []).filter((recording) => typeof recording.description === "string" && recording.description.trim() && (recording.endedAt || recording.status === "completed")));
      const instructionId = readiness.payload?.instructionIds?.[0];
      if (readiness.payload?.ready === true && instructionId) {
        const detail = await transport.post<{ instruction?: { body?: string; linkedRecordingIds?: string[] } }>("get-flow-instruction", { ...scope, instructionId });
        if (generation.current !== ticket) return;
        if (!detail.ok) throw new Error(detail.error || "Could not load the saved task instruction.");
        setInstructionId(instructionId);
        setBody(detail.payload?.instruction?.body ?? "");
        setLinked(detail.payload?.instruction?.linkedRecordingIds ?? []);
      }
      setTaskLoaded(true);
    }).catch((cause: unknown) => {
      /* best-effort: Only a disposed owner discards its obsolete request failure.
         The current owner always retains its error for actionable recovery. */
      if (generation.current === ticket) setError(cause instanceof Error ? cause.message : "Could not load task instructions.");
    }).finally(() => {
      if (generation.current === ticket) setLoading(false);
    });
    return () => { generation.current += 1; };
  }, [props.projectId, props.flowId, transport]);

  async function loadMore(): Promise<void> {
    if (!props.projectId || busy || loading) return;
    const ticket = generation.current;
    setLoading(true);
    const next = offset + 100;
    try {
      const result = await transport.post<{ recordings?: { recordingId: string; description?: string; endedAt?: number; status?: string }[]; page?: { total?: number } }>("list-recordings", { projectId: props.projectId, summaries: true, limit: 100, offset: next });
      if (generation.current !== ticket) return;
      if (!result.ok) throw new Error(result.error || "Could not load more recordings.");
      setRecordings((current) => [...current, ...(result.payload?.recordings ?? []).filter((recording) => recording.description?.trim() && (recording.endedAt || recording.status === "completed"))]);
      setOffset(next);
      setTotal(result.payload?.page?.total ?? total);
    } catch (cause) {
      if (generation.current === ticket) setError(cause instanceof Error ? cause.message : "Could not load more recordings.");
    } finally {
      if (generation.current === ticket) setLoading(false);
    }
  }

  async function save(): Promise<void> {
    if (!props.projectId || !props.flowId || busy) return;
    const instruction = body.trim();
    if (!instruction || instruction.length > 4000) {
      setError("Describe the automation task in 1-4000 characters.");
      return;
    }
    const ticket = generation.current;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await saveTaskInstruction(transport, { projectId: props.projectId, flowId: props.flowId, instruction, ...(instructionId ? { instructionId } : {}), ...(taskLoaded ? { linkedRecordingIds: linked } : {}) });
      if (generation.current !== ticket) return;
      if (!result.ok) {
        setError(result.error || "Task instructions could not be saved. Your text is still here.");
        return;
      }
      setStatus("Task instructions saved. Existing steps are preserved; saving instructions does not verify a previous build.");
      props.onSaved?.();
    } catch (cause) {
      if (generation.current === ticket) setError(cause instanceof Error ? cause.message : "Task instructions could not be saved. Your text is still here.");
    } finally {
      if (generation.current === ticket) setBusy(false);
    }
  }

  return <section aria-label="Automation task instructions" className="automation-flow-start-pane">
    <h3>Task instructions</h3>
    <p>Every automation needs an explicit task before it can build, run or resume. Describe the outcome and constraints in your own words. A recording is optional supporting evidence.</p>
    <label>Automation task<textarea aria-label="Automation task" disabled={loading || busy} maxLength={4000} rows={5} value={body} onChange={(event) => setBody(event.target.value)} /></label>
    <fieldset disabled={loading || busy || !taskLoaded}><legend>Optional described recordings</legend>
      {!loading && !taskLoaded ? <p>Recording links could not be loaded and will stay unchanged when you save the task.</p> : null}
      {recordings.length ? recordings.map((recording) => <label key={recording.recordingId}>
        <input checked={linked.includes(recording.recordingId)} type="checkbox" onChange={(event) => setLinked((current) => event.target.checked ? [...current, recording.recordingId] : current.filter((id) => id !== recording.recordingId))} />
        {recording.description}
      </label>) : <p>No finalized described recordings available. Add or edit a recording description in Recordings to use it here.</p>}
      {linked.filter((id) => !recordings.some((recording) => recording.recordingId === id)).map((id) => <label key={id}><input checked type="checkbox" onChange={() => setLinked((current) => current.filter((existing) => existing !== id))} />Previously attached recording {id} (kept unless removed)</label>)}
      {offset + 100 < total ? <button className="button" onClick={() => void loadMore()} type="button">More recordings</button> : null}
    </fieldset>
    {error ? <p role="alert">{error}</p> : null}
    {status ? <p role="status">{status}</p> : null}
    <button className="button button-primary" disabled={loading || busy || !body.trim() || !props.projectId || !props.flowId} onClick={() => void save()} type="button">{busy ? "Saving..." : "Save task instructions"}</button>
  </section>;
}
