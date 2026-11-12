"use client";

// The "Technical details" drawer the retired program pages had: one button that
// opens the tool's API, storage and runtime inventories, in keyboard tabs.

import { Wrench } from "lucide-react";
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Drawer } from "../components";
import { DEFAULT_CAPABILITIES, TOOL_CAPABILITIES } from "./capabilities";

type TechnicalTab = "api" | "storage" | "runtime";

const technicalTabLabels: Record<TechnicalTab, string> = {
  api: "API",
  storage: "Storage",
  runtime: "Runtime"
};

export function TechnicalDetails(props: { toolId: string; title: string }) {
  const capabilities = TOOL_CAPABILITIES[props.toolId] ?? DEFAULT_CAPABILITIES;
  const [technicalTab, setTechnicalTab] = useState<TechnicalTab>("api");
  const [technicalOpen, setTechnicalOpen] = useState(false);
  useEffect(() => {
    if (!technicalOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTechnicalOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [technicalOpen]);
  return (
    <>
      <button className="button program-technical-button" onClick={() => setTechnicalOpen(true)} type="button">
        <Wrench size={15} aria-hidden />
        Technical details
      </button>
      {technicalOpen ? <Drawer className="program-technical-content" description={"Framework interfaces exposed by " + props.title + "."} title="Technical details" onClose={() => setTechnicalOpen(false)}>
        <div className="program-tabs" role="tablist" aria-label="Technical detail categories">
          {(Object.keys(technicalTabLabels) as TechnicalTab[]).map((item, index, tabs) => (
            <button
              aria-controls={"technical-panel-" + item}
              aria-selected={technicalTab === item}
              className={technicalTab === item ? "program-tab selected" : "program-tab"}
              id={"technical-tab-" + item}
              key={item}
              onClick={() => setTechnicalTab(item)}
              onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const nextIndex = event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : event.key === "ArrowLeft"
                      ? (index - 1 + tabs.length) % tabs.length
                      : (index + 1) % tabs.length;
                const next = tabs[nextIndex];
                if (!next) return;
                setTechnicalTab(next);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
              }}
              role="tab"
              tabIndex={technicalTab === item ? 0 : -1}
              type="button"
            >
              {technicalTabLabels[item]}
            </button>
          ))}
        </div>
        <div aria-labelledby={"technical-tab-" + technicalTab} id={"technical-panel-" + technicalTab} role="tabpanel">
          <section className="panel">
            <h2 className="panel-title">{technicalTabLabels[technicalTab]}</h2>
            <div className="capability-list">
              {capabilities[technicalTab].map((item) => (
                <code key={item}>{item}</code>
              ))}
            </div>
          </section>
        </div>
      </Drawer> : null}
    </>
  );
}
