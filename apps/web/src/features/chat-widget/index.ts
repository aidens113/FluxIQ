"use client";

// FluxIQ's chat widget (`@fluxiq/ui-components`) in the panel: a thin React
// host over the real widget, reaching Core's real conversation endpoints. The
// Studio's window over the workspace and the chat-alone route both mount it.
export { ChatDock, type ChatDockProps } from "./ChatDock";
export { ChatWidget, type ChatWidgetProps } from "./ChatWidget";
export { ChatWidgetPage } from "./ChatWidgetPage";
export { ProgramChatWidget, type ProgramChatWidgetProps } from "./ProgramChatWidget";
export { createPanelOpenControl } from "./navigation";
export { chatFailure, createProgramChatTransport, type ChatFailure, type ProgramChatTransportOptions } from "./transport";
export { createProgramActivityPort, type ActivityTimers, type ProgramActivityPortOptions } from "./activity";
