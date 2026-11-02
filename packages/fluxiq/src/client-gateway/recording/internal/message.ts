import type { ClientGatewayEvent } from "../../contracts.ts";
export type ClientRecordingMessageEvent = Extract<ClientGatewayEvent, { type: "client.recording_entry" | "client.recording_event" | "client.snapshot" | "client.state_update" | "client.error" }>;
