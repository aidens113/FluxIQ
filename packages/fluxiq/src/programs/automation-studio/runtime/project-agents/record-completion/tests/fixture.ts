import type { ExecutionCallbackCall, ExecutionCallbackRootLifecycle } from "../../../../../../runtime/execution-observation/index.ts";
import { ExecutionObservationSource, invokeExecutionCallbackRoot } from "../../../../../../runtime/execution-observation/index.ts";
import { AutomationStudioSiteResetCallbackPolicies, AutomationStudioSiteResetObservation } from "../../../flow-bootstrap/reset-observation/index.ts";
import { sqlAdmissionAuthority } from "../../../../storage/project/execution-admission/tests/fixture.ts";
import type { AutomationStudioProjectExecutionAdmissionStore } from "../../../../../../framework/persistence/project/execution-admission/index.ts";

export async function queuedWriterFixture(store: AutomationStudioProjectExecutionAdmissionStore, resource: string) {
  let callbacks!: ExecutionObservationSource;
  const actual = await sqlAdmissionAuthority(store, { series: true, resources: [resource], configure(assembly, scope, source) {
    callbacks = new ExecutionObservationSource(scope, "fixture.actual-project-writers");
    source.delegatesTo.push(callbacks.owner);
    callbacks.connect(assembly.registerSource(callbacks.registration([callbacks.owner])));
  } });
  let released = false;
  const run = async <TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, invocation: object): Promise<Awaited<TResult>> => {
    AutomationStudioSiteResetCallbackPolicies.manage(callbacks, call);
    let observed: AutomationStudioSiteResetObservation | undefined;
    const lifecycle: ExecutionCallbackRootLifecycle = {
      callbacks,
      reserve: async () => await actual.assembly.consumer.reserve(actual.scope, actual.grant),
      prepared: parent => { observed = new AutomationStudioSiteResetObservation(invocation, { parent, callbacks, automation: undefined }); },
      finish: async root => { await actual.ports.producer.finish(root, actual.source.complete(actual.origin)); },
      unverified: async root => { await actual.ports.producer.observe(root, actual.source.prove(actual.origin, { kind: "returned_unverified", completionDigest: "fixture.writer.unverified" })); },
      interrupted: async (root, reason) => { await actual.ports.producer.interrupted(root, reason); },
      release: async reservation => {
        await actual.assembly.consumer.release(reservation);
        observed?.close();
        released = true;
      }
    };
    return await invokeExecutionCallbackRoot(lifecycle, call);
  };
  return { ...actual, callbacks, run, released: () => released };
}
