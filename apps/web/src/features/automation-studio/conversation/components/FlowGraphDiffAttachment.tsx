"use client";

// A structural repair, drawn as what it is.
//
// The adaptation review renders a before/after table of leaf field paths, and
// for a repair that adds a node, rewires an edge or splits a Subflow that is
// worse than nothing: fifty rows of `nodes.3.parameters.selector` is not a
// change anyone can read. This renders the structure instead -- what was added,
// what was removed, what changed and where -- read-only, inside the turn that
// proposed it.
//
// It deliberately does not mount `FlowGraphCanvas`. That component takes a
// `FlowEditorController`: sixty-odd fields of drag, reconnect, palette and
// selection state built for editing a graph the person owns. A transcript
// entry is evidence, not an editor, and wiring the editor's mutation surface
// into it to draw a picture would be the wrong trade. Drawing the same diff on
// a canvas later is a change to this one file.

import { GitBranch, Minus, Pencil, Plus } from "lucide-react";

type GraphDiffEntry = { id: string; label: string; detail: string | null };
type FlowGraphDiff = {
  flowId: string | null;
  added: GraphDiffEntry[];
  removed: GraphDiffEntry[];
  changed: GraphDiffEntry[];
};

const ID = /^[A-Za-z0-9._:>\/ -]{1,200}$/u;
const MAX_ENTRIES = 50;
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export function FlowGraphDiffAttachment(props: { payload: unknown; attachmentRef: string }) {
  const diff = parseFlowGraphDiff(props.payload);
  if (!diff) {
    return (
      <p className="automation-conversation-attachment-empty">
        {`This turn carries a Flow change (${props.attachmentRef}) that could not be read, so nothing is shown.`}
      </p>
    );
  }
  const rows = [
    ...diff.added.map((entry) => ({ change: "Added" as const, entry })),
    ...diff.removed.map((entry) => ({ change: "Removed" as const, entry })),
    ...diff.changed.map((entry) => ({ change: "Changed" as const, entry }))
  ];
  return (
    <section aria-label="Proposed Flow change" className="automation-conversation-attachment">
      <header>
        <GitBranch aria-hidden size={15} />
        <strong>Proposed Flow change</strong>
        {diff.flowId ? <small>{diff.flowId}</small> : null}
      </header>
      {rows.length ? (
        <div aria-label="Structural changes" className="automation-conversation-diff" role="table">
          <div className="automation-conversation-diff-row heading" role="row">
            <span role="columnheader">Change</span>
            <span role="columnheader">Where</span>
            <span role="columnheader">Detail</span>
          </div>
          {rows.map((row) => (
            <div className="automation-conversation-diff-row" key={`${row.change}:${row.entry.id}`} role="row">
              <span role="cell">
                {row.change === "Added" ? <Plus aria-hidden size={13} /> : row.change === "Removed" ? <Minus aria-hidden size={13} /> : <Pencil aria-hidden size={13} />}
                {row.change}
              </span>
              <span role="cell">{row.entry.label}</span>
              <span role="cell">{row.entry.detail ?? "-"}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="automation-conversation-attachment-empty">This change adds, removes and alters nothing.</p>
      )}
    </section>
  );
}

/**
 * Strict, for the same reason every other conversation payload is: what a
 * person approves has to be exactly what Core built. An unreadable diff shows
 * its reference rather than a half-parsed picture of a Flow.
 */
function parseFlowGraphDiff(value: unknown): FlowGraphDiff | null {
  if (!isRecord(value)) return null;
  const added = parseEntries(value.added);
  const removed = parseEntries(value.removed);
  const changed = parseEntries(value.changed);
  if (!added || !removed || !changed) return null;
  const flowId = value.flowId;
  if (flowId !== undefined && flowId !== null && !isName(flowId)) return null;
  return { flowId: typeof flowId === "string" ? flowId : null, added, removed, changed };
}

function parseEntries(value: unknown): GraphDiffEntry[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) return null;
  const entries: GraphDiffEntry[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !isName(candidate.id)) return null;
    if (candidate.label !== undefined && candidate.label !== null && !isSafeText(candidate.label)) return null;
    if (candidate.detail !== undefined && candidate.detail !== null && !isSafeText(candidate.detail)) return null;
    entries.push({
      id: candidate.id,
      label: typeof candidate.label === "string" && candidate.label ? candidate.label : candidate.id,
      detail: typeof candidate.detail === "string" && candidate.detail ? candidate.detail : null
    });
  }
  return entries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isName(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function isSafeText(value: unknown): value is string {
  return typeof value === "string" && value.length <= 300 && !UNSAFE_TEXT.test(value);
}
