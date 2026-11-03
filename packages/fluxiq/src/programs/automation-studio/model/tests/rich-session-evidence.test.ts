import { expectTypeOf, it } from "vitest";
import type { RuntimeActionAttempt as OldAttempt, AutomationStudioRuntimeSessionStatus as OldStatus, AutomationStudioRuntimeSession as OldSession } from "../runtime.ts";
import type { RuntimeActionAttempt, AutomationStudioRuntimeSessionStatus, AutomationStudioRuntimeSession } from "../../../../runtime/run-control/session/index.ts";
import type { StateFactReference as OldReference, StateFact as OldFact, NodeEvidenceRole as OldRole, EvidenceComparator as OldComparator, NodeEvidenceBinding as OldBinding, GeneratedMetadata as OldMetadata } from "../evidence.ts";
import type { StateFactReference, StateFact } from "../../../../runtime/state/facts/index.ts";
import type { NodeEvidenceRole, EvidenceComparator, NodeEvidenceBinding, GeneratedMetadata } from "../../../../flows/executable/evidence/index.ts";
import type { AutomationStudioFlowDocument } from "../../../../flows/authoring/legacy-artifact/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../../../engine/automation/index.ts";

it("preserves complete runtime session and evidence types through legacy imports", () => {
  expectTypeOf<OldAttempt>().toEqualTypeOf<RuntimeActionAttempt>();
  expectTypeOf<OldStatus>().toEqualTypeOf<AutomationStudioRuntimeSessionStatus>();
  expectTypeOf<OldSession>().toEqualTypeOf<AutomationStudioRuntimeSession>();
  expectTypeOf<OldReference>().toEqualTypeOf<StateFactReference>();
  expectTypeOf<OldFact>().toEqualTypeOf<StateFact>();
  expectTypeOf<OldRole>().toEqualTypeOf<NodeEvidenceRole>();
  expectTypeOf<OldComparator>().toEqualTypeOf<EvidenceComparator>();
  expectTypeOf<OldBinding>().toEqualTypeOf<NodeEvidenceBinding>();
  expectTypeOf<OldMetadata>().toEqualTypeOf<GeneratedMetadata>();
  expectTypeOf<AutomationStudioRuntimeSession["flow"]>().toEqualTypeOf<AutomationStudioFlowDocument>();
  expectTypeOf<AutomationStudioRuntimeSession["trace"]>().toEqualTypeOf<AutomationStudioGraphExecutionTrace | undefined>();
});

