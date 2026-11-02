import type { JsonObject } from "../../../../../core/index.ts";
import type { ExecutionCallbackCall, ExecutionCallbackIdentity } from "../../../../../runtime/execution-observation/index.ts";
import type { AutomationStudioCandidateTrialPort, AutomationStudioCandidateTrialRequest, AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";
import { candidateTrialAuthority } from "./of.ts";
import { candidateTrialModeOwner } from "./mode-of.ts";
import { candidateTrialInvocations } from "./invocations.ts";
import type { CandidateTrialAuthority } from "../contracts/index.ts";
import type { CandidateTrialCheckout } from "../contracts/index.ts";
import type { CandidateTrialCompletion } from "../contracts/index.ts";

/** One in-flight checkout binds all actual starts, reset calls and execution to the same root. */
export class CandidateTrialGateInvocation {
  private active: { checkout: CandidateTrialCheckout; authority: CandidateTrialAuthority | undefined } | undefined;
  private busy = false;
  private completed: { authority: CandidateTrialAuthority; proof: CandidateTrialCompletion } | undefined;

  constructor(private readonly gate: object, private readonly port: AutomationStudioCandidateTrialPort) {}

  bind<TReceiver, TArguments extends unknown[], TResult>(identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>): void {
    candidateTrialAuthority(this.port)?.bindFrame(identity);
  }

  get inFlight(): boolean { return this.busy; }
  get snapshot() { return this.active ? candidateTrialModeOwner(this.port)?.read(this.active.checkout) : undefined; }

  async canPromote(): Promise<boolean> { return this.active?.authority ? await this.active.authority.canPromote(this.active.checkout) : true; }

  async run<TReceiver, TArguments extends unknown[], TResult>(candidate: AutomationStudioFlowCandidate, value: JsonObject, signal: AbortSignal, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): Promise<Awaited<TResult>> {
    if (this.busy) throw new Error("candidate.trial_in_flight");
    this.busy = true;
    this.completed = undefined;
    const modeOwner = candidateTrialModeOwner(this.port);
    const authority = candidateTrialAuthority(this.port);
    let checkout: CandidateTrialCheckout | undefined;
    let failure: unknown;
    let failed = false;
    try {
      checkout = authority ? authority.checkout(this.gate, candidate, value) : modeOwner?.checkout(this.gate, candidate, value);
      if (checkout) this.active = { checkout, authority };
      if (authority && checkout) await authority.reserve(checkout, signal);
      const answer = authority && checkout ? await authority.invoke(checkout, "frame", call) : await call.callback.apply(call.receiver, call.args);
      if (authority && checkout) {
        const proof = authority.completion(checkout);
        if (proof) this.completed = { authority, proof };
      }
      return answer;
    } catch (error) {
      failed = true;
      failure = error;
      throw error;
    }
    finally {
      try {
        if (checkout) {
          if (authority) await authority.release(checkout);
          else modeOwner?.release(checkout);
        }
      } catch (cleanup) {
        this.completed = undefined;
        if (failed) throw new AggregateError([failure, cleanup], "candidate.trial_and_cleanup_failed");
        throw cleanup;
      } finally {
        this.active = undefined;
        this.busy = false;
      }
    }
  }

  attachStart(input: Parameters<NonNullable<AutomationStudioCandidateTrialPort["prepareStart"]>>[0]): void {
    if (this.active) candidateTrialModeOwner(this.port)?.attachStart(input, this.active.checkout);
  }

  attachRun(request: AutomationStudioCandidateTrialRequest): void {
    if (this.active) candidateTrialModeOwner(this.port)?.attachRun(request, this.active.checkout);
  }

  bindContext(context: object): void {
    const modeOwner = candidateTrialModeOwner(this.port);
    if (this.active && modeOwner) candidateTrialInvocations.set(context, { modeOwner, checkout: this.active.checkout });
  }

  invokeSync<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): TResult {
    return this.active?.authority ? this.active.authority.invokeSync(this.active.checkout, call) : call.callback.apply(call.receiver, call.args);
  }

  takeCompletion() {
    const completed = this.completed;
    this.completed = undefined;
    return completed;
  }
}
