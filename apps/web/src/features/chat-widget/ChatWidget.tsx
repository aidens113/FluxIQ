"use client";

// FluxIQ's chat widget (`@fluxiq/ui-components`) in React: a host element, and
// nothing else. The widget is plain DOM, so it is made once in an effect (never
// during server render), appended to the host, told what the panel knows, and
// removed again on unmount. React does not render the chat; it only places it.
//
// The widget reaches Core through the `transport` it is given. A project change
// is a new owner (`ownerKey`), so the chat forgets the last project's thread
// and no late answer for it lands.

import "@fluxiq/ui-components/styles/chat.css";
import "./chat-widget.css";
import { createChatWidget, type ChatHostStatus, type ChatOpenControlFactory, type ChatTransport, type ChatWidget as ChatWidgetHandle } from "@fluxiq/ui-components";
import { useEffect, useRef } from "react";

export type ChatWidgetProps = {
  transport: ChatTransport;
  projectId: string;
  /** Opens this automation's thread instead of the project's latest chat. */
  automation?: { flowId: string; name: string };
  /** What the panel knows of its connection. A signed-in panel is connected. */
  status?: { connected?: boolean; recording?: boolean };
  openControl?: ChatOpenControlFactory;
};

function hostStatus(props: ChatWidgetProps): ChatHostStatus {
  return {
    connected: props.status?.connected ?? true,
    ownerKey: JSON.stringify(["web", props.projectId]),
    projectId: props.projectId,
    recording: props.status?.recording ?? false
  };
}

export function ChatWidget(props: ChatWidgetProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<ChatWidgetHandle | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { transport } = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const status = hostStatus(latest.current);
    const widget = createChatWidget(transport, {
      ownerKey: status.ownerKey,
      ...(latest.current.openControl ? { openControl: latest.current.openControl } : {})
    });
    widgetRef.current = widget;
    host.append(widget.element);
    widget.render(status);
    widget.setActive(true);
    return () => {
      widget.setActive(false);
      widget.element.remove();
      if (widgetRef.current === widget) widgetRef.current = null;
    };
  }, [transport]);

  const { projectId, status } = props;
  const connected = status?.connected;
  const recording = status?.recording;
  useEffect(() => {
    widgetRef.current?.render(hostStatus(latest.current));
  }, [projectId, connected, recording]);

  const flowId = props.automation?.flowId;
  const name = props.automation?.name;
  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) return;
    const shown = widget.target();
    if (flowId === undefined || name === undefined) {
      if (shown.kind !== "latest") widget.open({ kind: "latest", projectId });
      return;
    }
    if (shown.kind !== "automation" || shown.flowId !== flowId) widget.open({ kind: "automation", flowId, name, projectId });
    else if (shown.name !== name) widget.updateAutomationName({ flowId, name });
  }, [projectId, flowId, name]);

  return <div className="chat-widget-host" data-testid="chat-widget-host" ref={hostRef} />;
}
