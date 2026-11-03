// What only the host can tell or do for the chat.

/**
 * What the host knows about its connection. `ownerKey` names who this chat
 * belongs to (the gateway, the client, the project); when it changes, nothing of
 * the last owner stays on screen and no reply for the old one lands. `recording`
 * says a recording is going on, when the chat never follows a run elsewhere.
 */
export type ChatHostStatus = {
  connected: boolean;
  ownerKey: string;
  projectId?: string | undefined;
  /** The open project's name, for the chat's heading; a person never reads the id. */
  projectName?: string | null | undefined;
  recording: boolean;
};

/** A control that opens FluxIQ's full surface, for what the chat cannot show. */
export type ChatOpenControl = { readonly element: HTMLElement; observe(status: ChatHostStatus): void };

/** Makes such a control; the host draws it, so the chat need not know how it opens anything. */
export type ChatOpenControlFactory = (style: {
  label: string;
  look: "small" | "link";
  canOpen?: () => boolean;
  /** What it is for, so a host can go straight there instead of opening itself: a model key to add, or a question only FluxIQ can show. */
  purpose?: "model-key" | "ask";
}) => ChatOpenControl;
