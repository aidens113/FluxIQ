// What decides what a paired client's person may read through it (its `client.focus_project`, its activity, and which
// chats it is told changed), installed on the client gateway, and which of the process's activity and of this
// instance's chat changes reach that gateway at all: only this instance's own projects'.
export * from "./authority.ts";
export * from "./conversation-relay.ts";
export * from "./own-project-activity.ts";
export type { PairedProjectFocusDependencies, PairedProjectFocusIdentity } from "./types.ts";
