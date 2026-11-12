import type { AutomationStudioInputUseFrameCapture } from "./frame-capture.ts";
import type { AutomationStudioInputUseChildCapture } from "./child-capture.ts";
import type { AutomationStudioInputUseRead } from "./read.ts";
import type { AutomationStudioInputUseLease } from "./lease.ts";

/** Injected trusted scope/producer owner, never an authority supplied by request JSON. */
export type AutomationStudioInputUseAuthority = {
  open(capture: AutomationStudioInputUseFrameCapture, signal?: AbortSignal): Promise<AutomationStudioInputUseRead<AutomationStudioInputUseLease>>;
  child(capture: AutomationStudioInputUseChildCapture, signal?: AbortSignal): Promise<AutomationStudioInputUseRead<AutomationStudioInputUseAuthority>>;
};
