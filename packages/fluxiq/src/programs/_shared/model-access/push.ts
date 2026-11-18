import type { ModelAccessPush, ModelAccessPushDependencies, ModelAccessPushIdentity } from "./types.ts";

/**
 * Wires a runtime's model access to the clients that show it, with no timer
 * (t928). Every source's change runs one `changed`: the gateway works each
 * ready person-paired session's state out again and sends
 * `server.model_access_changed` where it differs from what that session was
 * last sent, and every listener on `changes` (the panel's change stream) is
 * told to read the Secret Keys snapshot again.
 *
 * The gateway's authority answers a session's person only while that person
 * is enabled and has a role, read as the paired program route reads them;
 * otherwise null, so nothing is sent. The identity's directory changes are
 * watched as soon as it is first read, so a person being disabled or
 * re-enabled is a change too. `stop` removes every subscription, the
 * authority and the listeners.
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
    const directory = await identity.snapshot();
    const person = directory.users.find((user) => user.id === userId);
    if (!person?.enabled || !directory.roles.some((role) => role.id === person.roleId)) return null;
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
