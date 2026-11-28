// The panel's one push channel (`GET /api/panel/changes`): one stream per page, shared by
// every reader that needs to know when to read again (the gateway, threads, live activity).
export { browserPanelChangeSources } from "./browser-sources";
export { PanelChangeConnection } from "./connection";
export { SESSION_RESTORED_EVENT } from "./session-restored-event";
export { sharedPanelChanges } from "./shared-connection";
export type { PanelChangeEventStream, PanelChangeEventType, PanelChangeListener, PanelChangeSources, PanelChangeStatus, PanelChangesPort } from "./types";
