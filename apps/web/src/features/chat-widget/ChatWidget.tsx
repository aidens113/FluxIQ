"use client";

// FluxIQ's chat widget (`@fluxiq/ui-components`) in React: a host element, and
// nothing else. The widget is plain DOM, so it is made once in an effect (never
// during server render), appended to the host, told what the panel knows, and
// removed again on unmount. React does not render the chat; it only places it.
//
// This is the one place the panel mounts the chat, for the window over the
// Studio and for the chat-alone route alike. With `windowed` the chat sits in
// a window (`createChatWindow`): collapsed it is not unmounted, it keeps
// reading the thread list so the launcher's badge can light, and the window
// carries the chat's name.
//
// The widget reaches Core through the `transport` it is given. A project change
// is a new owner (`ownerKey`), so the chat forgets the last project's thread
// and no late answer for it lands.

import "@fluxiq/ui-components/styles/chat.css";
import "./chat-widget.css";
import {
  createChatWidget,
  createChatWindow,
  type ChatHostStatus,
  type ChatTarget,
  type ChatTransport,
  type ChatWidget as ChatWidgetHandle,
  type ChatWidgetOptions,
  type ChatWindow
} from "@fluxiq/ui-components";
import { useEffect, useRef } from "react";

export type ChatWidgetProps = {
  transport: ChatTransport;
  /** The project the host has open; null when none is, and the chat then spans every project the person can see. */
  projectId: string | null;
  /** The open project's name, for the chat's heading. */
  projectName?: string | null;
  /** Opens this automation's thread instead of the project's latest chat. */
  automation?: { flowId: string; name: string };
  /** What the panel knows of its connection. A signed-in panel is connected. */
  status?: { connected?: boolean; recording?: boolean };
  /** Everything the panel passes besides the owner key (`options/`). Read when the chat is made. */
  options?: Omit<ChatWidgetOptions, "ownerKey">;
  /** Puts the chat in a window; the chat's name and the count of threads waiting go to the window. */
  windowed?: { ariaLabel: string; escapeBlocked(): boolean };
  /** Hears the thread on screen, now and at each change, so the transport can follow its project. */
  onTarget?(target: ChatTarget): void;
};

function hostStatus(props: ChatWidgetProps): ChatHostStatus {
  return {
    connected: props.status?.connected ?? true,
    ownerKey: JSON.stringify(["web", props.projectId]),
    ...(props.projectId ? { projectId: props.projectId } : {}),
    projectName: props.projectName ?? null,
    recording: props.status?.recording ?? false
  };
}

/**
 * The options, with the window hearing the chat's name and the threads waiting on the person.
 * No owner key is given up front: the first status then makes the chat's first owner, which is
 * what scopes its latest chat to the host's project when it holds a list of threads.
 */
function optionsFor(props: ChatWidgetProps, frame: () => ChatWindow | null): ChatWidgetOptions {
  const base = props.options ?? {};
  if (!props.windowed || !base.threads) return base;
  const { threads } = base;
  return {
    ...base,
    threads: {
      ...threads,
      onTitle: (title) => {
        frame()?.setTitle(title);
        threads.onTitle?.(title);
      },
      onUnanswered: (count) => {
        frame()?.setWaiting(count);
        threads.onUnanswered?.(count);
      }
    }
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
    const current = latest.current;
    const status = hostStatus(current);
    let frame: ChatWindow | null = null;
    const widget = createChatWidget(transport, optionsFor(current, () => frame));
    if (current.windowed) {
      frame = createChatWindow(widget, {
        ariaLabel: current.windowed.ariaLabel,
        escapeBlocked: () => latest.current.windowed?.escapeBlocked() ?? false
      });
    }
    widgetRef.current = widget;
    const placed = (frame ?? widget).element;
    host.append(placed);
    widget.render(status);
    const stopHearing = widget.onTargetChange((target) => latest.current.onTarget?.(target));
    latest.current.onTarget?.(widget.target());
    widget.setActive(true);
    return () => {
      stopHearing();
      // An open window holds a key listener on the document; closing it lets go.
      frame?.close();
      widget.setActive(false);
      placed.remove();
      if (widgetRef.current === widget) widgetRef.current = null;
    };
  }, [transport]);

  const { projectId, projectName, status } = props;
  const connected = status?.connected;
  const recording = status?.recording;
  useEffect(() => {
    widgetRef.current?.render(hostStatus(latest.current));
  }, [projectId, projectName, connected, recording]);

  const flowId = props.automation?.flowId;
  const name = props.automation?.name;
  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) return;
    const shown = widget.target();
    const project = projectId ?? undefined;
    if (flowId === undefined || name === undefined) {
      // A thread the person picked from the list stays; only an automation's own thread gives way.
      if (shown.kind === "automation") widget.open({ kind: "latest", projectId: project });
      return;
    }
    if (shown.kind !== "automation" || shown.flowId !== flowId) widget.open({ kind: "automation", flowId, name, projectId: project });
    else if (shown.name !== name) widget.updateAutomationName({ flowId, name });
  }, [projectId, flowId, name]);

  return <div className="chat-widget-host" data-testid="chat-widget-host" data-windowed={props.windowed ? "true" : "false"} ref={hostRef} />;
}
