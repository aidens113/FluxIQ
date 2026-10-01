import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { NodeStateViewModel } from "./model/types";
import { ClipboardButton } from "../../programs/components";

export function StateRawPanel(props: { model: NodeStateViewModel }) {
  const [expanded, setExpanded] = useState(false);
  const regionId = `automation-state-raw-${useId().replace(/:/g, "")}`;
  const raw = useMemo(() => expanded ? JSON.stringify(props.model.raw, null, 2) : "", [expanded, props.model.raw]);
  if (!expanded) {
    return (
      <div className="automation-state-raw-placeholder">
        <button aria-controls={regionId} aria-expanded="false" className="button" type="button" onClick={() => setExpanded(true)}><ChevronDown aria-hidden size={14} />Show raw JSON</button>
      </div>
    );
  }
  return <section className="automation-state-raw-detail" id={regionId}><header><div><strong>Raw state JSON</strong><span>Diagnostic source data for this state context.</span></div><div className="inline-actions"><ClipboardButton key={JSON.stringify([props.model.activeSource?.id, props.model.activePhase])} accessibleLabel="Copy raw state JSON" label="Copy JSON" value={raw} /><button aria-controls={regionId} aria-expanded="true" className="button" onClick={() => setExpanded(false)} type="button"><ChevronUp aria-hidden size={14} />Hide raw JSON</button></div></header><pre className="automation-state-raw">{raw}</pre></section>;
}
