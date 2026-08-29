import { useMemo, useState } from "react";
import type { NodeStateViewModel } from "./model/types";

export function StateRawPanel(props: { model: NodeStateViewModel }) {
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const raw = useMemo(() => expanded ? JSON.stringify(props.model.raw, null, 2) : "", [expanded, props.model.raw]);
  if (!expanded) {
    return (
      <div className="automation-state-raw-placeholder">
        <button type="button" onClick={() => setExpanded(true)}>Show raw JSON</button>
      </div>
    );
  }
  return <section className="automation-state-raw-detail"><header><div><strong>Raw state JSON</strong><span>Diagnostic source data for this state context.</span></div><button className="button" onClick={() => { void navigator.clipboard.writeText(raw).then(() => setCopyStatus("Copied")).catch(() => setCopyStatus("Copy failed")); }} type="button">Copy JSON</button></header>{copyStatus ? <span aria-live="polite">{copyStatus}</span> : null}<pre className="automation-state-raw">{raw}</pre></section>;
}
