"use client";

// "Effective handlers" for the selected step, in the order the run would try
// them. Each entry's link asks the Flow editor showing that graph to select
// the handler, as its own outline would.

import { LifeBuoy } from "lucide-react";
import { requestAutomationGraphNodeFocus } from "../graph/node-focus";
import type { InspectorEffectiveHandlers } from "./effective-handlers";

export function EffectiveHandlersSection(props: { model: InspectorEffectiveHandlers }) {
  const { handlers, note } = props.model;
  return (
    <details className="automation-inspector-section automation-effective-handlers" open>
      <summary>Effective handlers</summary>
      {handlers.length ? (
        <ol aria-label="Handlers that apply to this step, in the order the run tries them">
          {handlers.map((handler) => (
            <li key={handler.key}>
              <span className="automation-effective-handler-event">{handler.eventWords}</span>
              <button
                className="automation-effective-handler-link"
                onClick={() => requestAutomationGraphNodeFocus({ ...(handler.open.flowId ? { flowId: handler.open.flowId } : {}), nodeId: handler.open.nodeId })}
                title="Open this handler on the canvas"
                type="button"
              >
                <LifeBuoy size={13} aria-hidden />
                {handler.name}
              </button>
              <small>{handler.levelWords} · {handler.conditionWords === "Always" ? "Any time" : "Only when " + handler.conditionWords}</small>
            </li>
          ))}
        </ol>
      ) : null}
      {note ? <p className="automation-effective-handlers-note">{note}</p> : null}
    </details>
  );
}
