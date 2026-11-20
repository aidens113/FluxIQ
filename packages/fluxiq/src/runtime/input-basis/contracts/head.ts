import type { AutomationStudioInputRevision } from "./reference.ts";
import type { AutomationStudioInputSnapshotReference } from "./snapshot.ts";
import type { AutomationStudioInputProducer } from "./producer.ts";

export type AutomationStudioInputHead = Readonly<{ reference: AutomationStudioInputRevision; snapshot: AutomationStudioInputSnapshotReference; producers: readonly AutomationStudioInputProducer[] }>;
