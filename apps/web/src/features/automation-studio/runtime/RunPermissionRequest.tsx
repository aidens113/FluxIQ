"use client";

import React from "react";
import { ShieldAlert } from "lucide-react";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES, parseAutomationStudioActionPermissionRequest, type AutomationStudioActionPermissionRequest } from "fluxiq/automation-studio/action-permissions";

/**
 * The question a run brings back when its recovery needed to do something
 * lasting that neither the run's grant nor the Flow's instruction allowed.
 *
 * The run has already ended with the request in hand; Core keeps no pending
 * request and no parked run. So the answer is a new run: **Allow and run
 * again** hands the parsed request back, and the caller issues a grant whose
 * permitted consequences are exactly the request's `missing` classes, for the
 * same run intent. **Don't allow** only dismisses it: nothing is sent, and the
 * Flow and page stay as the run left them.
 *
 * What is shown is only what Core built. The request is read through Core's
 * strict parser, so a record with an unknown field, an unknown consequence or
 * a name that could carry markup shows nothing rather than something Core did
 * not say. A request from the build (stage `authoring`) belongs to the
 * authoring panel and is not shown here.
 *
 * `onAllow` is absent when the run carried no grant: without a run intent
 * there is no grant to widen, so the person is told how to be asked again.
 */
export function RunPermissionRequest(props: {
  runDetail: unknown;
  busy?: boolean;
  onAllow?(request: AutomationStudioActionPermissionRequest): void;
  onDismiss(): void;
}) {
  const request = recoveryPermissionRequest(props.runDetail);
  if (!request) return null;
  const granted = request.authority.granted;
  return (
    <section aria-label="Permission requested by this run" className="automation-runtime-readiness" role="status">
      <ShieldAlert size={17} aria-hidden />
      <div>
        <strong>This run stopped to ask for permission.</strong>
        <span>{request.sentence}</span>
        <ul aria-label="Consequences requiring approval">{request.missing.map((consequence) => <li key={consequence}>{AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES[consequence]}</li>)}</ul>
        {granted.length ? <small>{`Already allowed for this run: ${granted.map((consequence) => AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES[consequence]).join("; ")}.`}</small> : null}
        {props.onAllow
          ? <small>The run did not do this, and no repair was proposed. Allowing starts a new run whose grant permits only the consequences listed above.</small>
          : <small>The run did not do this. It ran without an LLM grant, so there is no grant to extend: run the Flow again with Explore and adapt to allow it.</small>}
      </div>
      <div>
        <button className="button" disabled={props.busy} onClick={props.onDismiss} type="button">Don&apos;t allow</button>
        {props.onAllow ? <button className="button button-primary" disabled={props.busy} onClick={() => props.onAllow?.(request)} type="button">{props.busy ? "Running..." : "Allow and run again"}</button> : null}
      </div>
    </section>
  );
}

function recoveryPermissionRequest(runDetail: unknown): AutomationStudioActionPermissionRequest | null {
  const metadata = runDetail && typeof runDetail === "object" ? (runDetail as { metadata?: unknown }).metadata : undefined;
  const raw = metadata && typeof metadata === "object" ? (metadata as { permissionRequest?: unknown }).permissionRequest : undefined;
  if (raw === undefined) return null;
  const request = parseAutomationStudioActionPermissionRequest(raw);
  return request?.reason.stage === "recovery" ? request : null;
}
