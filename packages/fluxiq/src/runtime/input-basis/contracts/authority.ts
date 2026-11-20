import type { AutomationStudioInputScope } from "./scope.ts";
import type { AutomationStudioInputProducer } from "./producer.ts";
import type { AutomationStudioInputRevision } from "./reference.ts";
import type { AutomationStudioInputRead } from "./read.ts";

export type AutomationStudioInputProducerOwner = {
  verifyCurrent(context: { scope: AutomationStudioInputScope; role: AutomationStudioInputProducer["role"] }, reference: AutomationStudioInputRevision): Promise<AutomationStudioInputRead<true>>;
};
