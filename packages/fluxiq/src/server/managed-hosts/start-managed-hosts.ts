import type { ClientGatewayService } from "../../client-gateway/index.ts";
import type { FluxIQHostLaunchRequest } from "./host-launch-request.ts";
import type { FluxIQHostLauncher } from "./host-launcher.ts";
import type { FluxIQLaunchedHost } from "./launched-host.ts";

/** Owns engine-started hosts, including initial partial failure and later host death. */
export async function startManagedHosts(options: {
  gateway: ClientGatewayService;
  launcher: FluxIQHostLauncher;
  count: number;
  domainId: string;
  gatewayUrl: string;
  coreApiUrl: string;
  dataDir: string;
  profile: FluxIQHostLaunchRequest["profile"];
  headless: boolean;
  print?: (message: string) => void;
  onFailure?: (error: unknown) => void;
  signal?: AbortSignal;
}): Promise<{ close(): Promise<void> }> {
  const controller = new AbortController();
  const hosts = new Map<string, FluxIQLaunchedHost>();
  const launches = new Set<Promise<void>>();
  const fresh = options.profile.kind === "fresh";
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => closing ??= (async () => {
    controller.abort(new Error("The engine is stopping its managed hosts."));
    await Promise.allSettled([...launches]);
    const outcomes = await Promise.allSettled([...hosts].map(async ([hostId, host]) => {
      try { await host.close(); } finally { if (fresh) await options.gateway.managedHosts.revokeManagedHost(hostId, "managed host stopped"); }
    }));
    hosts.clear();
    const failed = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    if (failed.length) throw new AggregateError(failed.map((failure) => failure.reason), "Some managed hosts did not close cleanly.");
  })();

  const launch = async (hostId: string): Promise<void> => {
    const ready = awaitReadyHost(options.gateway, hostId, controller.signal);
    let host: FluxIQLaunchedHost;
    try {
      host = await options.launcher.launch({ hostId, gatewayUrl: options.gatewayUrl, coreApiUrl: options.coreApiUrl, dataDir: options.dataDir,
        profile: options.profile, headless: options.headless, signal: controller.signal,
        takeEnrolmentTicket: () => options.gateway.managedHosts.issueHostEnrolment({ hostId, domainId: options.domainId, profile: options.profile.kind }).ticket });
      hosts.set(hostId, host);
      await Promise.race([ready.promise, host.closed.then(() => { throw new Error(`Managed host ${hostId} closed before it enrolled.`); })]);
      if (controller.signal.aborted) throw controller.signal.reason;
    } finally {
      ready.dispose();
    }
    options.print?.(`Managed browser ${hostId} is ready.`);
    void host.closed.then(async () => {
      if (controller.signal.aborted || hosts.get(hostId) !== host) return;
      hosts.delete(hostId);
      if (!fresh) {
        options.print?.(`Managed browser ${hostId} closed; its named profile is preserved.`);
        return;
      }
      options.print?.(`Managed browser ${hostId} closed; starting a fresh host.`);
      await options.gateway.managedHosts.revokeManagedHost(hostId, "managed browser closed unexpectedly");
      if (!controller.signal.aborted) await track(hostId);
    }).catch((error: unknown) => {
      if (controller.signal.aborted && error === controller.signal.reason) return; // Only the engine's own cancellation is expected.
      const report = (failure: unknown): void => {
        if (options.onFailure) options.onFailure(failure);
        else console.error("Managed host recovery failed:", failure);
      };
      // Drain every owned launch/host before telling the engine it can exit.
      void close().then(() => report(error), (cleanup: unknown) => report(new AggregateError([error, cleanup], "Managed host recovery and cleanup failed.")));
    });
  };
  const track = (hostId: string): Promise<void> => {
    const running = launch(hostId);
    launches.add(running);
    void running.finally(() => launches.delete(running)).catch(/* best-effort: the original launch promise is awaited by startup or recovery */ () => undefined);
    return running;
  };
  const abort = (): void => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  await options.gateway.managedHosts.revokeStaleManagedHosts();
  try {
    await Promise.all(Array.from({ length: options.count }, (_, index) => track(`host-${index + 1}`)));
    return { close };
  } catch (error) {
    await close().catch((cleanup: unknown) => { throw new AggregateError([error, cleanup], "Managed browser startup failed and cleanup was incomplete."); });
    throw error;
  }
}

function awaitReadyHost(gateway: ClientGatewayService, hostId: string, signal: AbortSignal): { promise: Promise<void>; dispose(): void } {
  const earlier = new Set(gateway.snapshot().sessions.filter((session) => session.managedHostId === hostId).map((session) => session.sessionId));
  let done: () => void;
  let failed: (reason: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    done = resolve;
    failed = reject;
  });
  // A launcher can fail before anyone awaits readiness; retain the error for
  // its consumer without an unhandled rejection on shutdown.
  void promise.catch(/* best-effort: launch awaits the original readiness promise or reports its own earlier failure */ () => undefined);
  const check = (): void => { if (gateway.snapshot().sessions.some((session) => !earlier.has(session.sessionId) && session.managedHostId === hostId && session.status === "ready" && session.disconnectedAt === undefined)) done(); };
  const unsubscribe = gateway.onEvent(() => check());
  const aborted = (): void => failed(signal.reason);
  signal.addEventListener("abort", aborted, { once: true });
  if (signal.aborted) aborted();
  check();
  return { promise, dispose: () => {
    unsubscribe();
    signal.removeEventListener("abort", aborted);
  } };
}
