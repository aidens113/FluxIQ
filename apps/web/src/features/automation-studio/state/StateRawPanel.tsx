import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { NodeStateViewModel } from "./model/types";

export function StateRawPanel(props: { model: NodeStateViewModel }) {
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const regionId = `automation-state-raw-${useId().replace(/:/g, "")}`;
  const raw = useMemo(() => expanded ? JSON.stringify(props.model.raw, null, 2) : "", [expanded, props.model.raw]);
  if (!expanded) {
    return (
      <div className="automation-state-raw-placeholder">
        <button aria-controls={regionId} aria-expanded="false" className="button" type="button" onClick={() => setExpanded(true)}><ChevronDown aria-hidden size={14} />Show raw JSON</button>
      </div>
    );
  }
  return <section className="automation-state-raw-detail" id={regionId}><header><div><strong>Raw state JSON</strong><span>Diagnostic source data for this state context.</span></div><div className="inline-actions"><button className="button" onClick={() => { void navigator.clipboard.writeText(raw).then(() => setCopyStatus("Copied")).catch(() => setCopyStatus("Copy failed")); }} type="button"><Copy aria-hidden size={14} />Copy JSON</button><button aria-controls={regionId} aria-expanded="true" className="button" onClick={() => { setExpanded(false); setCopyStatus(""); }} type="button"><ChevronUp aria-hidden size={14} />Hide raw JSON</button></div></header>{copyStatus ? <span aria-live="polite" role="status">{copyStatus}</span> : null}<pre className="automation-state-raw">{raw}</pre></section>;
}
