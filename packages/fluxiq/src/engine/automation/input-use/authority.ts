import type { AutomationStudioInputUseFrameCapture } from "./frame-capture.ts";
import type { AutomationStudioInputUseChildCapture } from "./child-capture.ts";
import type { AutomationStudioInputUseRead } from "./read.ts";
import type { AutomationStudioInputUseLease } from "./lease.ts";
import type { AutomationStudioInputUseNodeCapture, AutomationStudioInputUseNodeLease } from "./node/index.ts";

/** Injected trusted scope/producer owner, never an authority supplied by request JSON. */
export type AutomationStudioInputUseAuthority = {
  open(capture: AutomationStudioInputUseFrameCapture, signal?: AbortSignal): Promise<AutomationStudioInputUseRead<AutomationStudioInputUseLease>>;
  child(capture: AutomationStudioInputUseChildCapture, signal?: AbortSignal): Promise<AutomationStudioInputUseRead<AutomationStudioInputUseAuthority>>;
  /** Optional (t905 C1): a lease over one node callback's exact pair. Absent, every node event stays unknown. */
  node?(capture: AutomationStudioInputUseNodeCapture, signal?: AbortSignal): Promise<AutomationStudioInputUseRead<AutomationStudioInputUseNodeLease>>;
};
