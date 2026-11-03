import type { AutomationStudioOfflineTrialHost } from "./contracts.ts";

let installed: AutomationStudioOfflineTrialHost | undefined;

/** The process setting that turns offline-first trials off (D44): `0` is off, anything else leaves them on. */
const OFF_SETTING = "FLUXIQ_OFFLINE_TRIALS";

/**
 * What offline-first trials in builds run with (trace plan P6, t769),
 * installed once by the host that builds the runtime, beside its trace
 * episodes (`programs/_shared/runtime.ts`, as
 * `../../gateway-trace/installation.ts` is): the client gateway, the trace
 * store of a project, the public view of a project's live session, and a
 * reevaluator when one is bound. Static, so the service needs no new member.
 * Nothing installed -- tracing off, or a test that installed none -- or the
 * process setting `FLUXIQ_OFFLINE_TRIALS=0` (D44, for P7's off/on
 * measurement): every test runs live, as before P6.
 */
export const AutomationStudioOfflineTrialInstallation = Object.freeze({
  /** Installs `host` in place of any earlier installation and answers the function that uninstalls exactly it (the newest runtime serves). */
  install(host: AutomationStudioOfflineTrialHost): () => void {
    installed = host;
    return () => {
      if (installed === host) installed = undefined;
    };
  },
  /** The installed host, or nothing while none is installed or the process turns offline trials off; read when a build's factory is made. */
  current(): AutomationStudioOfflineTrialHost | undefined {
    if (process.env[OFF_SETTING] === "0") return undefined;
    return installed;
  }
});
