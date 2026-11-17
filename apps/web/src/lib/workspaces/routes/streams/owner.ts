import type { WorkspaceRouteContext, WorkspaceRouteValidation } from "../types";
import { WorkspaceStreamError } from "./error";
import type { WorkspaceStreamDescriptor, WorkspaceStreamOptions, WorkspaceStreamPreparation, WorkspaceStreamPrepare } from "./types";

/** Owns one selected tenant through setup, handoff and the entire lazy producer lifetime. */
export class WorkspaceStreamOwner {
  private iterator: WorkspaceStreamDescriptor["iterator"] | undefined;
  private descriptor: WorkspaceStreamDescriptor | undefined;
  private preparing: Promise<WorkspaceStreamPreparation> | undefined;
  private reading: Promise<IteratorResult<string | Uint8Array, unknown>> | undefined;
  private checking: Promise<void> | undefined;
  private cleanup: Promise<void> | undefined;
  private failure: WorkspaceStreamError | undefined;
  private controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  private ended = false;
  private transferred = false;
  private cleaned = false;
  private headers = new Headers();
  private status = 200;
  private readonly abort = () => {
    this.beginEnd(new WorkspaceStreamError("workspace_stream.aborted", { ok: false, status: 401, error: "Authentication required" }));
    this.errorController();
  };

  constructor(private readonly context: WorkspaceRouteContext, private readonly signal: AbortSignal, private readonly options: WorkspaceStreamOptions) {
    signal.addEventListener("abort", this.abort, { once: true });
    if (signal.aborted) this.abort();
  }

  async response(prepare: WorkspaceStreamPrepare): Promise<Response> {
    try {
      this.assertOpen();
      // Register work before invoking any caller code, including a reentrant abort.
      this.preparing = Promise.resolve().then(async () => {
        this.assertOpen();
        const current = await this.authorized();
        this.assertOpen();
        const result = await prepare(this.context, current.caller);
        if (result.ok) this.adopt(result);
        return result;
      });
      const prepared = await this.preparing;
      this.assertOpen();
      if (!prepared.ok) {
        await this.authorized();
        this.assertOpen();
        throw new WorkspaceStreamError("workspace_stream.authority_lost", prepared);
      }
      await this.boundary();
      this.assertOpen();
      const body = new ReadableStream<Uint8Array>({
        start: controller => { this.controller = controller; },
        pull: () => this.pull(),
        cancel: () => this.cancel()
      }, { highWaterMark: 0 });
      const response = new Response(body, { status: this.status, headers: this.headers });
      this.assertOpen();
      this.transferred = true;
      return response;
    } catch (error) {
      const safe = error instanceof WorkspaceStreamError ? error : new WorkspaceStreamError("workspace_stream.setup_failed");
      await this.beginEnd(safe);
      const first = this.failure ?? safe;
      return Response.json({ ok: false, error: first.refusal?.error ?? first.message }, { status: first.refusal?.status ?? 500 });
    } finally {
      if (!this.transferred) await this.beginEnd();
    }
  }

  private adopt(descriptor: WorkspaceStreamDescriptor): void {
    // Ownership precedes header/descriptor validation and any further await.
    this.iterator = descriptor.iterator;
    if (!this.iterator || typeof this.iterator.next !== "function" || typeof this.iterator.return !== "function"
      || typeof descriptor.revalidateDomain !== "function") throw new WorkspaceStreamError("workspace_stream.setup_failed");
    this.descriptor = descriptor;
    this.headers = new Headers(descriptor.headers);
    this.status = descriptor.status ?? 200;
  }

  private async pull(): Promise<void> {
    if (this.ended) return;
    try {
      await this.boundary();
      this.assertOpen();
      const next = Promise.resolve().then(() => {
        this.assertOpen();
        return this.iterator!.next();
      });
      this.reading = next;
      const step = await next;
      this.assertOpen();
      await this.boundary();
      this.assertOpen();
      if (step.done) {
        await this.beginEnd();
        if (this.failure) this.errorController();
        else this.controller!.close();
      } else {
        const chunk = typeof step.value === "string" ? new TextEncoder().encode(step.value)
          : step.value instanceof Uint8Array ? step.value.slice() : undefined;
        if (!chunk) throw new WorkspaceStreamError("workspace_stream.read_failed");
        this.assertOpen();
        this.controller!.enqueue(chunk);
      }
    } catch (error) {
      const safe = error instanceof WorkspaceStreamError ? error : new WorkspaceStreamError("workspace_stream.read_failed");
      await this.beginEnd(safe);
      this.errorController();
    }
  }

  private async cancel(): Promise<void> {
    await this.beginEnd();
    if (this.failure?.cleanupFailureCode || this.failure?.code === "workspace_stream.cleanup_failed") throw this.failure;
  }

  private boundary(): Promise<void> {
    const check = Promise.resolve().then(async () => {
      this.assertOpen();
      await this.authorized();
      this.assertOpen();
      const refusal = await this.descriptor!.revalidateDomain();
      this.assertOpen();
      if (refusal) throw new WorkspaceStreamError("workspace_stream.authority_lost", refusal);
      await this.authorized();
      this.assertOpen();
    });
    this.checking = check;
    return check;
  }

  private async authorized(): Promise<WorkspaceRouteValidation & { ok: true }> {
    let current: WorkspaceRouteValidation;
    try {
      current = await this.context.revalidate();
    } catch {
      throw new WorkspaceStreamError("workspace_stream.authority_lost", { ok: false, status: 503, error: "Request authority could not be verified." });
    }
    if (!current.ok) throw new WorkspaceStreamError("workspace_stream.authority_lost", current);
    return current;
  }

  private assertOpen(): void {
    if (this.ended || this.signal.aborted || !this.context.current()) throw this.failure ?? new WorkspaceStreamError("workspace_stream.aborted", { ok: false, status: 401, error: "Authentication required" });
  }

  private beginEnd(failure?: WorkspaceStreamError): Promise<void> {
    if (!this.ended) {
      this.ended = true;
      this.failure = failure;
      this.signal.removeEventListener("abort", this.abort);
      // Install the promise before invoking any producer/observer callbacks.
      this.cleanup = Promise.resolve().then(() => this.retire());
    }
    return this.cleanup!;
  }

  private async retire(): Promise<void> {
    if (this.cleaned) return;
    this.cleaned = true;
    // Preparation may still return a producer after abort. Its adoption runs
    // before this promise settles, so that late producer is retired too.
    await Promise.allSettled([this.preparing]);
    let returned: Promise<unknown> | undefined;
    try {
      if (this.iterator?.return) {
        returned = Promise.resolve(this.iterator.return());
      }
    } catch {
      this.cleanupFailure();
    }
    // return is requested promptly, including while next is pending. A real
    // async generator may queue it behind next; its tenant must remain held.
    const results = await Promise.allSettled([this.reading, this.checking, returned]);
    if (results[2]?.status === "rejected") this.cleanupFailure();
    try {
      this.context.release();
    } catch {
      this.cleanupFailure();
    }
  }

  private cleanupFailure(): void {
    if (!this.failure) this.failure = new WorkspaceStreamError("workspace_stream.cleanup_failed");
    else this.failure.cleanupFailureCode = "workspace_stream.cleanup_failed";
    try {
      if (this.options.onCleanupFailure) this.options.onCleanupFailure("workspace_stream.cleanup_failed");
      else console.error("workspace_stream.cleanup_failed");
    } catch {
      console.error("workspace_stream.cleanup_observer_failed");
    }
  }

  private errorController(): void {
    if (this.controller && this.failure) this.controller.error(this.failure);
  }
}
