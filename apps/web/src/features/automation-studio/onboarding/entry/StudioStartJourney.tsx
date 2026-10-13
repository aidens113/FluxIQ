"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { OnboardingStartOptionId } from "..";

export function StudioStartJourney(props: {
  intent: OnboardingStartOptionId | null;
  entryKey: string;
  domainId: string | null;
  state: "catalog" | "restoring" | "project";
  projectId: string | null;
  consumeIntent: () => boolean;
  createAutomation: () => void;
  openConnectedBrowsers: () => void;
  children: ReactNode;
}) {
  const scopeKey = JSON.stringify([props.entryKey, props.intent, props.state, props.projectId]);
  const scopeRef = useRef({ key: scopeKey });
  if (scopeRef.current.key !== scopeKey) scopeRef.current = { key: scopeKey };
  const scope = scopeRef.current;
  const current = useRef(props); current.current = props;
  const mounted = useRef(false);
  const activated = useRef<object | null>(null);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const consume = (nextStep: boolean) => {
    if (!mounted.current || scopeRef.current !== scope || activated.current === scope || !current.current.intent
      || current.current.consumeIntent !== props.consumeIntent || current.current.createAutomation !== props.createAutomation || current.current.openConnectedBrowsers !== props.openConnectedBrowsers) return;
    if (nextStep && (current.current.state !== "project" || !current.current.projectId)) return;
    const action = current.current;
    if (!action.consumeIntent()) return;
    activated.current = scope;
    if (nextStep) {
      if (action.intent === "describe") action.createAutomation();
      else action.openConnectedBrowsers();
    }
  };
  const setup = new URLSearchParams();
  if (props.domainId) setup.set("domainId", props.domainId);
  const setupHref = `/get-started${setup.size ? `?${setup}` : ""}`;
  return <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0, height: "100%" }}>
    {props.intent ? <section aria-label="Start an automation" style={{ flexShrink: 0, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
      <h2>{props.intent === "describe" ? "Describe an automation" : props.intent === "demonstrate" ? "Show FluxIQ how" : "Extract data from this page"}</h2>
      <p>{props.intent === "describe"
        ? "Create an automation and write the website task in Instructions. You can attach a described recording as supporting evidence. Select a model in Settings, then build and test the automation in Steps."
        : props.intent === "demonstrate"
          ? "Connect and select a browser in Connected browsers, then choose Start recording and describe what the demonstration shows. Stop the recording, create an automation, and write the task in Instructions. Attach the recording as optional support, then build and test in Steps."
          : "Open the extension on the target page and choose extraction. Select a table or list and inspect its preview there. Write what the automation should collect in Instructions; a described recording can support that task. Build and test the scraper in Steps."}</p>
      {props.state === "catalog" ? <p>Choose a project below, or create one, to keep this automation's work together.</p> : null}
      {props.state === "restoring" ? <p role="status">Opening your project. Your linked workspace will be restored before the next step.</p> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {props.state !== "catalog" ? <button className="button button-primary" disabled={props.state !== "project" || !props.projectId} onClick={() => consume(true)} type="button">
          {props.intent === "describe" ? "Create automation" : "Open Connected browsers"}
        </button> : null}
        <button className="button button-secondary" onClick={() => consume(false)} type="button">Dismiss</button>
        <a className="button button-secondary" href={setupHref}>Get started</a>
      </div>
    </section> : null}
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0 }}>{props.children}</div>
  </div>;
}
