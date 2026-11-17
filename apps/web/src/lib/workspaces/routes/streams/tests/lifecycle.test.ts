import { describe, expect, it } from "vitest";
import type { WorkspaceRouteValidation } from "../../types";
import type { WorkspaceStreamDescriptor } from "..";
import { deferred, streamRuntime } from "./stream-runtime";

describe("workspace stream terminal races", () => {
  it("requests producer return promptly on cancel and waits for both pending next and return", async () => {
    const h = streamRuntime();
    const reading = deferred<IteratorResult<string, unknown>>();
    const returning = deferred<IteratorResult<string, unknown>>();
    const readEntered = deferred();
    const returnEntered = deferred();
    h.next.mockImplementationOnce(() => {
      readEntered.resolve();
      return reading.promise;
    });
    h.retire.mockImplementationOnce(() => {
      returnEntered.resolve();
      return returning.promise;
    });
    const response = await h.owner.response(h.prepare);
    const reader = response.body!.getReader();
    const pendingRead = reader.read();
    await readEntered.promise;
    const cancellation = reader.cancel("private consumer reason");
    await returnEntered.promise;
    expect(h.release).not.toHaveBeenCalled();
    returning.resolve({ done: true, value: undefined });
    await returning.promise;
    expect(h.release).not.toHaveBeenCalled();
    reading.resolve({ done: false, value: "late private row" });
    await cancellation;
    expect(await pendingRead).toEqual({ done: true, value: undefined });
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("aborts a pending read without publishing its late chunk or releasing early", async () => {
    const controller = new AbortController();
    const h = streamRuntime(controller.signal);
    const reading = deferred<IteratorResult<string, unknown>>();
    const readEntered = deferred();
    const returnEntered = deferred();
    const released = deferred();
    h.next.mockImplementationOnce(() => {
      readEntered.resolve();
      return reading.promise;
    });
    h.retire.mockImplementationOnce(async () => {
      returnEntered.resolve();
      return { done: true, value: undefined };
    });
    h.release.mockImplementation(() => released.resolve());
    const response = await h.owner.response(h.prepare);
    const pendingRead = response.body!.getReader().read().catch((error: unknown) => error);
    await readEntered.promise;
    controller.abort(new Error("private abort cause"));
    await returnEntered.promise;
    expect(await pendingRead).toMatchObject({ code: "workspace_stream.aborted", message: "The stream request ended." });
    expect(h.release).not.toHaveBeenCalled();
    reading.resolve({ done: false, value: "late private row" });
    await released.promise;
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("adopts and retires a producer that arrives after a preparation abort", async () => {
    const controller = new AbortController();
    const h = streamRuntime(controller.signal);
    const preparing = deferred<WorkspaceStreamDescriptor>();
    const entered = deferred();
    const responsePromise = h.owner.response(async () => {
      entered.resolve();
      return preparing.promise;
    });
    await entered.promise;
    controller.abort();
    expect(h.release).not.toHaveBeenCalled();
    preparing.resolve(h.descriptor);
    const response = await responsePromise;
    expect(response.status).toBe(401);
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.next).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("does not release on abort while an authority callback is still pending", async () => {
    const controller = new AbortController();
    const h = streamRuntime(controller.signal);
    const guard = deferred<WorkspaceRouteValidation>();
    const entered = deferred();
    const returned = deferred();
    const released = deferred();
    const response = await h.owner.response(h.prepare);
    h.revalidate.mockImplementationOnce(() => {
      entered.resolve();
      return guard.promise;
    });
    h.retire.mockImplementationOnce(async () => {
      returned.resolve();
      return { done: true, value: undefined };
    });
    h.release.mockImplementation(() => released.resolve());
    const pendingRead = response.body!.getReader().read().catch((error: unknown) => error);
    await entered.promise;
    controller.abort();
    await returned.promise;
    expect(h.release).not.toHaveBeenCalled();
    guard.resolve({ ok: true, caller: h.caller });
    expect(await pendingRead).toMatchObject({ code: "workspace_stream.aborted" });
    await released.promise;
    expect(h.next).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("cancels while a pre-read guard is pending and never starts next afterward", async () => {
    const h = streamRuntime();
    const guard = deferred<WorkspaceRouteValidation>();
    const entered = deferred();
    const returned = deferred();
    const response = await h.owner.response(h.prepare);
    h.revalidate.mockImplementationOnce(() => {
      entered.resolve();
      return guard.promise;
    });
    h.retire.mockImplementationOnce(async () => {
      returned.resolve();
      return { done: true, value: undefined };
    });
    const reader = response.body!.getReader();
    const pendingRead = reader.read();
    await entered.promise;
    const cancellation = reader.cancel();
    await returned.promise;
    expect(h.release).not.toHaveBeenCalled();
    guard.resolve({ ok: true, caller: h.caller });
    await cancellation;
    expect(await pendingRead).toEqual({ done: true, value: undefined });
    expect(h.next).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("rejects a late chunk when cancellation overlaps its post-read domain check", async () => {
    const h = streamRuntime();
    const guard = deferred<null>();
    const entered = deferred();
    const returned = deferred();
    const response = await h.owner.response(h.prepare);
    h.next.mockImplementationOnce(async () => {
      h.domain.mockImplementationOnce(() => {
        entered.resolve();
        return guard.promise;
      });
      return { done: false, value: "private row after next" };
    });
    h.retire.mockImplementationOnce(async () => {
      returned.resolve();
      return { done: true, value: undefined };
    });
    const reader = response.body!.getReader();
    const pendingRead = reader.read();
    await entered.promise;
    const cancellation = reader.cancel();
    await returned.promise;
    expect(h.release).not.toHaveBeenCalled();
    guard.resolve(null);
    await cancellation;
    expect(await pendingRead).toEqual({ done: true, value: undefined });
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("waits for a final pre-handoff guard after abort, then answers a safe refusal", async () => {
    const controller = new AbortController();
    const h = streamRuntime(controller.signal);
    const guard = deferred<null>();
    const entered = deferred();
    const returned = deferred();
    h.domain.mockImplementationOnce(() => {
      entered.resolve();
      return guard.promise;
    });
    h.retire.mockImplementationOnce(async () => {
      returned.resolve();
      return { done: true, value: undefined };
    });
    const responsePromise = h.owner.response(h.prepare);
    await entered.promise;
    controller.abort();
    await returned.promise;
    expect(h.release).not.toHaveBeenCalled();
    guard.resolve(null);
    const response = await responsePromise;
    expect(response.status).toBe(401);
    expect(h.next).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("handles a reentrant abort inside next before that next settles", async () => {
    const controller = new AbortController();
    const h = streamRuntime(controller.signal);
    const reading = deferred<IteratorResult<string, unknown>>();
    const returned = deferred();
    const released = deferred();
    h.next.mockImplementationOnce(() => {
      controller.abort();
      return reading.promise;
    });
    h.retire.mockImplementationOnce(async () => {
      returned.resolve();
      return { done: true, value: undefined };
    });
    h.release.mockImplementation(() => released.resolve());
    const response = await h.owner.response(h.prepare);
    const pendingRead = response.body!.getReader().read().catch((error: unknown) => error);
    await returned.promise;
    expect(h.release).not.toHaveBeenCalled();
    reading.resolve({ done: false, value: "private late row" });
    expect(await pendingRead).toMatchObject({ code: "workspace_stream.aborted" });
    await released.promise;
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("settles a producer read rejection after cancel without leaking it to the consumer", async () => {
    const h = streamRuntime();
    const reading = deferred<IteratorResult<string, unknown>>();
    const entered = deferred();
    const returned = deferred();
    h.next.mockImplementationOnce(() => {
      entered.resolve();
      return reading.promise;
    });
    h.retire.mockImplementationOnce(async () => {
      returned.resolve();
      return { done: true, value: undefined };
    });
    const response = await h.owner.response(h.prepare);
    const reader = response.body!.getReader();
    const pendingRead = reader.read();
    await entered.promise;
    const cancellation = reader.cancel();
    await returned.promise;
    reading.reject(new Error("private late producer exception"));
    await cancellation;
    expect(await pendingRead).toEqual({ done: true, value: undefined });
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.observer).not.toHaveBeenCalled();
  });

  it("coalesces EOF, cancel and abort while producer return is pending", async () => {
    const controller = new AbortController();
    const h = streamRuntime(controller.signal);
    const returning = deferred<IteratorResult<string, unknown>>();
    const entered = deferred();
    h.retire.mockImplementationOnce(() => {
      entered.resolve();
      return returning.promise;
    });
    const response = await h.owner.response(h.prepare);
    const reader = response.body!.getReader();
    const pendingRead = reader.read();
    await entered.promise;
    const cancellation = reader.cancel();
    controller.abort();
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).not.toHaveBeenCalled();
    returning.resolve({ done: true, value: undefined });
    await cancellation;
    expect(await pendingRead).toEqual({ done: true, value: undefined });
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("signals abort immediately while retaining the tenant until producer return settles", async () => {
    const controller = new AbortController();
    const h = streamRuntime(controller.signal);
    const returning = deferred<IteratorResult<string, unknown>>();
    const entered = deferred();
    const released = deferred();
    h.retire.mockImplementationOnce(() => {
      entered.resolve();
      return returning.promise;
    });
    h.release.mockImplementation(() => released.resolve());
    const response = await h.owner.response(h.prepare);
    const reader = response.body!.getReader();
    controller.abort(new Error("private abort detail"));
    await entered.promise;
    await expect(reader.read()).rejects.toMatchObject({ code: "workspace_stream.aborted" });
    expect(h.release).not.toHaveBeenCalled();
    returning.resolve({ done: true, value: undefined });
    await released.promise;
    expect(h.next).not.toHaveBeenCalled();
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
  });
});
