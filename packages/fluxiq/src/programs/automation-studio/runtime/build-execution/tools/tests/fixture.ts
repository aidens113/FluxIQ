import { createExecutionAdmissionAuthority, type ExecutionEntry } from "../../../../../../runtime/execution-admission/index.ts";
import { AdmissionTestPersistence } from "../../../../../../runtime/execution-admission/tests/persistence.ts";
import { AdmissionTestScopeOwner } from "../../../../../../runtime/execution-admission/tests/scope-owner.ts";
import { ExecutionCallbackRootSource, ExecutionObservationSource } from "../../../../../../runtime/execution-observation/index.ts";
import type { OrdinaryExecutionRunBindingReader } from "../../../../../../runtime/output-dispatch/admission/index.ts";
import { createAutomationStudioBuildToolObserver } from "../../../../../../runtime/flow-authoring/execution/tools/index.ts";

export async function buildToolFixture(store = new AdmissionTestPersistence(), configure?: (source: ExecutionObservationSource) => void) {
  const scopes = new AdmissionTestScopeOwner();
  const assembly = createExecutionAdmissionAuthority({ persistence: store, scopes });
  const scopeProof = scopes.issue();
  const scopeOwner = scopes.readBinding(scopeProof);
  if (!scopeOwner) throw new Error("test.original_scope_required");
  const scope = await assembly.openScope(scopeProof);
  const callbacks = new ExecutionObservationSource(scope, "studio.build.callbacks");
  const roots = new ExecutionCallbackRootSource(scope, assembly.consumer, callbacks, "studio.build.tools");
  configure?.(callbacks);
  callbacks.connect(assembly.registerSource(callbacks.registration([callbacks.owner])));
  roots.connect(assembly.registerSource(roots.registration([callbacks.owner])));
  const proofs = new WeakMap<object, ExecutionEntry>();
  const issued: ExecutionEntry[] = [];
  const runBindings: OrdinaryExecutionRunBindingReader & { issueOrdinaryRunBinding(root: ExecutionEntry): Promise<object> } = {
    async issueOrdinaryRunBinding(root) {
      const actual = assembly.entryBridge.read(root);
      if (actual.row.parentId || actual.lifecycle !== "open" || !actual.reservationActive) throw new Error("test.actual_root_required");
      const proof = Object.freeze({});
      proofs.set(proof, root);
      issued.push(root);
      return proof;
    },
    readOrdinaryRunBinding(proof, parent) {
      const root = proofs.get(proof);
      if (!root || !assembly.entryBridge.matchesReservation(root, parent.reservation) || !assembly.entryBridge.matchesReservation(parent.parent, parent.reservation)) return null;
      const actual = assembly.entryBridge.read(root);
      const child = assembly.entryBridge.read(parent.parent);
      if (!actual.reservationActive || !child.reservationActive || actual.lifecycle !== "open" || child.lifecycle !== "open" || child.row.rootId !== actual.row.entryId || child.row.scopeId !== actual.row.scopeId || child.row.ownerIncarnation !== actual.row.ownerIncarnation || child.fenceGeneration !== actual.fenceGeneration) return null;
      return { kind: "execution_root", owner: { projectId: scopeOwner.binding.projectId, flowId: "flow.actual", runId: actual.row.entryId } };
    }
  };
  const observer = createAutomationStudioBuildToolObserver({ scope, roots, callbacks, runBindings });
  return { store, scopes, scope, assembly, callbacks, roots, observer, runBindings, issued };
}
