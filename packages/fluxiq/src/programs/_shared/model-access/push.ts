import { modelAccessRecipientAllowed } from "./recipient-decision.ts";
import type { ModelAccessPush, ModelAccessPushDependencies, ModelAccessPushIdentity } from "./types.ts";

/**
 * Wires a runtime's model access to the clients that show it, with no timer
 * (t928). Every source's change runs one `changed`: the gateway works each
 * ready person-paired session's state out again and sends
 * `server.model_access_changed` where it differs from what that session was
 * last sent, and every listener on `changes` (the panel's change stream) is
 * told to read the Secret Keys snapshot again.
 *
 * The gateway's authority answers a session's person only when the Secret
 * Keys snapshot would answer that session's own call: the same IAM decision
 * of the snapshot's registered action, for the same paired-client actor, made
 * per recipient each time the state is worked out
 * (`modelAccessRecipientAllowed`, t950 F4). Otherwise null, so nothing is
 * sent, and a decision that could not be made throws, which the gateway reads
 * as "could not be read". The push and the snapshot therefore never disagree,
 * whether the person is allowed, denied by a policy, or narrowed as a paired
 * browser. The identity's directory changes are watched as soon as it is
 * first read, so a person being disabled or re-enabled is a change too; IAM
 * decision changes come in as a source. `stop` removes every subscription,
 * the authority and the listeners.
 */
export function installModelAccessPush(dependencies: ModelAccessPushDependencies): ModelAccessPush {
  const listeners = new Set<() => void>();
  const stops: Array<() => void> = [];
  const watched = new WeakSet<ModelAccessPushIdentity>();
  let stopped = false;

  const changed = (): void => {
    if (stopped) return;
    dependencies.gateway.publish();
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        // One listener must not stop the others; only the error's kind is kept, never its words.
        console.warn(`A model-access change listener failed (${error instanceof Error ? error.name : "non_error"}).`);
      }
    }
  };
  const watch = (identity: ModelAccessPushIdentity): void => {
    if (stopped || watched.has(identity)) return;
    watched.add(identity);
    stops.push(identity.directoryChanges.subscribe(changed));
  };

  for (const source of dependencies.sources) stops.push(source.subscribe(changed));
  dependencies.gateway.setAuthority(async ({ sessionId, userId }) => {
    const identity = await dependencies.identity();
    watch(identity);
    if (!await modelAccessRecipientAllowed(dependencies.registry, await identity.snapshot(), { sessionId, userId })) return null;
    return await dependencies.stateOf({ sessionId, userId });
  });
  // Watched from the start too, so a directory change before any session read is heard.
  dependencies.identity().then(watch).catch(/* best-effort: the first session read watches it again */ () => undefined);

  return {
    changes: {
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      dependencies.gateway.setAuthority(undefined);
      for (const stop of stops.splice(0)) stop();
      listeners.clear();
    }
  };
}
