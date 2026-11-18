import type { AutomationStudioRuntimeView } from "../view.ts";

/** Domain defaults to the evidence domain, then IO domain, unless explicitly supplied. */
export type AutomationStudioRuntimeFallbackState = Omit<AutomationStudioRuntimeView, "domainId"> & { domainId?: string | null | undefined };
