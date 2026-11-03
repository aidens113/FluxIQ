import type { ActivityDisplay, ClientGatewayActivity } from "fluxiq/ui";
import type { ChatOverlayPreference } from "./transport.ts";

/**
 * What a client knows about FluxIQ's live activity. `current` is the latest
 * event of the most recent unit of work, or null when nothing has been reported.
 * `display` is the paced status the live line shows, null before the first event.
 * `recent` holds the latest events of every kind, oldest first. `history` holds,
 * for each of the last units of work, every event the chat tells as a step
 * message (`ACTIVITY_HISTORY_LIMITS`, `fluxiq/ui`), so the chat can show a whole
 * build; absent, the chat falls back to `recent`. `live` says whether the stream
 * is reaching this client.
 */
export type ChatActivityState = {
  current: ClientGatewayActivity | null;
  display: ActivityDisplay | null;
  recent: ClientGatewayActivity[];
  history?: ClientGatewayActivity[];
  overlay: ChatOverlayPreference;
  live: boolean;
};
