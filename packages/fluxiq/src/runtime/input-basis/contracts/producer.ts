import type { AutomationStudioInputRevision } from "./reference.ts";

/** Ordered dependency, authenticated through its registered owner. */
export type AutomationStudioInputProducer = Readonly<{ role: "inherited" | "defaults" | "caller" | "binding"; reference: AutomationStudioInputRevision }>;
