"use client";

// The chat widget wired to this panel: Core's conversation endpoints through
// the Studio's program transport, and the Secret Keys program for whether a
// model key is enabled (never a value).

import { useMemo, useRef } from "react";
import { useProgramTransport } from "../automation-studio/data/use-program-transport";
import { ChatWidget } from "./ChatWidget";
import { studioOpenControl } from "./studio-open-control";
import { createProgramChatTransport } from "./transport";

export type ProgramChatWidgetProps = {
  projectId: string;
  automation?: { flowId: string; name: string };
};

export function ProgramChatWidget(props: ProgramChatWidgetProps) {
  const studio = useProgramTransport("automation-studio");
  const secretKeys = useProgramTransport("secret-keys");
  // The transport asks for the project at each request, so it outlives a project change.
  const project = useRef(props.projectId);
  project.current = props.projectId;
  const transport = useMemo(() => createProgramChatTransport(studio, { projectId: () => project.current, secretKeys }), [studio, secretKeys]);
  return <ChatWidget
    transport={transport}
    projectId={props.projectId}
    {...(props.automation ? { automation: props.automation } : {})}
    openControl={studioOpenControl}
  />;
}
