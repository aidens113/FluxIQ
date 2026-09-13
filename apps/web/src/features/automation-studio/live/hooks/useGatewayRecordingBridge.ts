"use client";

import { useEffect, useRef } from "react";
import { automationStudioGatewayActivitySnapshot } from "../../model/project-summary-converters";
import {
  createAutomationGatewayRecordingMonitorState,
  monitorAutomationGatewayRecording,
  type AutomationGatewayRecordingTransition
} from "../../recordings/commands";
import { registerAutomationStudioDevelopmentSubscription } from "../../development/telemetry";
import type { AutomationLiveCommandScopeController } from "../command-scope";
import { observeAutomationStudioGatewayContext } from "../gateway-context-publication";

const AUTOMATION_STUDIO_CONTEXT_ENDPOINT = "/api/client-gateway/automation-studio-context";

function sendAutomationStudioContextBeacon(payload: string): boolean {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return false;
  try {
    return navigator.sendBeacon(AUTOMATION_STUDIO_CONTEXT_ENDPOINT, new Blob([payload], { type: "application/json" }));
  } catch {
    return false;
  }
}

export function useAutomationGatewayRecordingBridge(input: {
  projectId: string | null;
  flowId: string | null;
  scopes: AutomationLiveCommandScopeController;
  snapshot: any;
  publishSnapshot(snapshot: any): void;
  publishBlocked(entry: any): void;
  publishTransition(transition: Exclude<AutomationGatewayRecordingTransition, { kind: "none" }>): void | Promise<void>;
}): void {
  const callbacksRef = useRef(input);
  callbacksRef.current = input;
  const activitySignatureRef = useRef("");
  const blockedAuditIdRef = useRef("");
  const monitorStateRef = useRef(createAutomationGatewayRecordingMonitorState());

  useEffect(() => {
    const unregister = registerAutomationStudioDevelopmentSubscription({ id: "project-context", kind: "event" });
    const body = (activeProjectId: string | null, activeFlowId: string | null) => JSON.stringify({ activeProjectId, activeFlowId });
    const post = (payload: string) => {
      void fetch(AUTOMATION_STUDIO_CONTEXT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload
      }).catch(() => undefined);
    };
    const stopObserving = observeAutomationStudioGatewayContext({
      window,
      document,
      publisher: {
        publish: () => post(body(callbacksRef.current.projectId, callbacksRef.current.flowId)),
        revoke: (mode) => {
          const payload = body(null, null);
          // A page being torn down can lose a fetch before it leaves; a beacon
          // is handed to the browser to deliver on its own. Without it the
          // clean-close path would rely on the lease expiring, and the lease is
          // long precisely because a clean close revokes.
          if (mode === "beacon" && sendAutomationStudioContextBeacon(payload)) return;
          post(payload);
        }
      }
    });
    return () => {
      unregister();
      stopObserving();
    };
  }, [input.projectId, input.flowId]);

  useEffect(() => {
    let cancelled = false;
    const unregister = registerAutomationStudioDevelopmentSubscription({ id: "gateway-activity", kind: "event" });
    const refresh = async () => {
      const response = await fetch("/api/client-gateway/snapshot", { cache: "no-store" }).catch(() => null);
      if (!response) return;
      if (response.status === 401) {
        cancelled = true;
        window.location.href = "/";
        return;
      }
      const result = await response.json().catch(() => null);
      if (cancelled || !result?.ok) return;
      const activity = automationStudioGatewayActivitySnapshot(result.payload);
      const signature = JSON.stringify(activity);
      if (signature === activitySignatureRef.current) return;
      activitySignatureRef.current = signature;
      callbacksRef.current.publishSnapshot(activity);
    };
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      cancelled = true;
      unregister();
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);

  useEffect(() => {
    const blocked = [...(input.snapshot?.auditLog ?? [])].reverse().find((entry: any) => entry.type === "recording.project_required");
    if (!blocked || blocked.id === blockedAuditIdRef.current) return;
    blockedAuditIdRef.current = blocked.id;
    input.publishBlocked(blocked);
  }, [input.snapshot?.auditLog, input.publishBlocked]);

  useEffect(() => {
    monitorStateRef.current = createAutomationGatewayRecordingMonitorState();
  }, [input.projectId]);

  useEffect(() => {
    const scope = input.scopes.current();
    if (!scope) return;
    void monitorAutomationGatewayRecording({
      scope,
      sessions: input.snapshot?.sessions ?? [],
      state: monitorStateRef.current,
      signal: input.scopes.signal()
    }, {
      isCurrent: (candidate) => input.scopes.isCurrent(candidate),
      publish: input.publishTransition
    }).then((outcome) => {
      if (outcome.status === "success") monitorStateRef.current = outcome.value.state;
    });
  }, [input.projectId, input.scopes, input.snapshot?.sessions, input.publishTransition]);
}