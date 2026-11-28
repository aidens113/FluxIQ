/**
 * The window event announcing that the person signed in again in place (the
 * Restore session dialog), without the page reloading. A change stream the
 * server refused while the session had lapsed is closed for good by the
 * browser; this is one of the moments the page's stream opens again, so every
 * reader reads what changed meanwhile.
 */
export const SESSION_RESTORED_EVENT = "fluxiq:session-restored";
