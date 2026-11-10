import type { FluxNodeRunResult } from "@fluxiq/contracts/fluxnode";

/**
 * A mapped call that ended other than achieved (budget gone, stopped, or waiting for a person). The
 * pipeline run ends the same way: there is no failed ending to turn it into (fluxnode-plan N3).
 */
export class PipelineCallEnded extends Error {
  readonly called: FluxNodeRunResult;

  constructor(called: FluxNodeRunResult) {
    super(`The FluxNode "${called.name}" ended ${called.status}.`);
    this.name = "PipelineCallEnded";
    this.called = called;
  }
}
