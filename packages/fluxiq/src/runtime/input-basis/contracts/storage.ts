import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioInputScope } from "./scope.ts";
import type { AutomationStudioInputProducer } from "./producer.ts";
import type { AutomationStudioInputSnapshotReference } from "./snapshot.ts";
import type { AutomationStudioInputHead } from "./head.ts";
import type { AutomationStudioInputState } from "./state.ts";

/** Snapshot writes stay outside compareAndSwap's owning document transaction. */
export type AutomationStudioInputBasisStorage = {
  readonly durable: boolean;
  read(scope: AutomationStudioInputScope): Promise<AutomationStudioInputState | undefined>;
  writeSnapshot(scope: AutomationStudioInputScope, values: JsonObject, producers: readonly AutomationStudioInputProducer[]): Promise<AutomationStudioInputSnapshotReference>;
  readSnapshot(scope: AutomationStudioInputScope, head: AutomationStudioInputHead): Promise<JsonObject | undefined>;
  compareAndSwap(scope: AutomationStudioInputScope, expected: AutomationStudioInputState | undefined, next: AutomationStudioInputHead): Promise<boolean>;
};
