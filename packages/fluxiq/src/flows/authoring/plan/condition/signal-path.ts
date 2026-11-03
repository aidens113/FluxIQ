/** `inputs.<name>` or `state.<name>`, dotted, each segment a plain word. */
export const AUTOMATION_STUDIO_ROUTE_SIGNAL_PATH = /^(?:inputs|state)(?:\.[A-Za-z0-9_-]{1,64}){1,6}$/u;
