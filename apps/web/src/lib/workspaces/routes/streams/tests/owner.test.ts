import { describe, expect, it, vi } from "vitest";
import type { WorkspaceStreamDescriptor } from "..";
import { streamRuntime } from "./stream-runtime";

describe("workspace lazy response ownership", () => {
  it("discards a chunk when the primary generation ends after awaited authorization", async () => {
    const h = streamRuntime();
    h.next.mockResolvedValueOnce({ done: false, value: "private data" });
    const response = await h.owner.response(h.prepare);
    h.revalidate.mockImplementation(async () => {
      h.current.mockReturnValue(false);
      return { ok: true, caller: h.caller };
    });
    await expect(response.text()).rejects.toThrow();
    expect(h.next).not.toHaveBeenCalled();
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("hands off without reading or releasing, and reads only in response to demand", async () => {
    const h = streamRuntime();
    h.next.mockResolvedValueOnce({ done: false, value: "Title\r\n" });
    const response = await h.owner.response(h.prepare);
    expect(response.status).toBe(200);
    expect(h.prepare).toHaveBeenCalledWith(h.context, h.caller);
    expect(h.next).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
    const reader = response.body!.getReader();
    expect(await reader.read()).toEqual({ done: false, value: new TextEncoder().encode("Title\r\n") });
    expect(h.next).toHaveBeenCalledOnce();
    expect(h.release).not.toHaveBeenCalled();
    await reader.cancel();
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("preserves raw string and byte chunks and retires once at EOF", async () => {
    const h = streamRuntime();
    h.next.mockResolvedValueOnce({ done: false, value: "Name\r\n" });
    h.next.mockResolvedValueOnce({ done: false, value: new TextEncoder().encode("'=SUM(A1)\r\n") });
    const response = await h.owner.response(h.prepare);
    expect(await response.text()).toBe("Name\r\n'=SUM(A1)\r\n");
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.observer).not.toHaveBeenCalled();
  });

  it("copies byte chunks before returning them to the reader", async () => {
    const h = streamRuntime();
    const bytes = new Uint8Array([1, 2, 3]);
    h.next.mockResolvedValueOnce({ done: false, value: bytes });
    const response = await h.owner.response(h.prepare);
    const reader = response.body!.getReader();
    const chunk = await reader.read();
    bytes.fill(0);
    expect(chunk.value).toEqual(new Uint8Array([1, 2, 3]));
    await reader.cancel();
  });

  it("cancels an unread response without starting the producer", async () => {
    const h = streamRuntime();
    const response = await h.owner.response(h.prepare);
    await response.body!.cancel({ private: "caller cancellation details" });
    expect(h.next).not.toHaveBeenCalled();
    expect(h.retire).toHaveBeenCalledWith();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("refuses authority before calling setup and releases the selected context", async () => {
    const h = streamRuntime();
    h.revalidate.mockResolvedValue({ ok: false, status: 403, error: "Permission denied" });
    const response = await h.owner.response(h.prepare);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "Permission denied" });
    expect(h.prepare).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("sanitizes setup exceptions instead of returning a row or storage path", async () => {
    const h = streamRuntime();
    h.prepare.mockRejectedValue(new Error("private row at C:/secret/tenant.sqlite"));
    const response = await h.owner.response(h.prepare);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "The stream could not be prepared." });
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.retire).not.toHaveBeenCalled();
  });

  it("rechecks authority after a setup refusal was selected asynchronously", async () => {
    const h = streamRuntime();
    const response = await h.owner.response(async () => {
      h.revalidate.mockResolvedValue({ ok: false, status: 401, error: "Authentication required" });
      return { ok: false, status: 404, error: "Run dataset was not found or is not available." };
    });
    expect(response.status).toBe(401);
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("retains a safe setup refusal when cleanup also fails", async () => {
    const h = streamRuntime();
    h.release.mockImplementation(() => { throw new Error("private release path"); });
    const response = await h.owner.response(async () => ({ ok: false, status: 404, error: "Run dataset was not found or is not available." }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "Run dataset was not found or is not available." });
    expect(h.observer).toHaveBeenCalledOnce();
    expect(h.observer).toHaveBeenCalledWith("workspace_stream.cleanup_failed");
  });

  it("retires a created producer if response headers are invalid", async () => {
    const h = streamRuntime();
    const response = await h.owner.response(async () => ({ ...h.descriptor, headers: { "Bad\nHeader": "private value" } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "The stream could not be prepared." });
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.next).not.toHaveBeenCalled();
  });

  it("retires a created producer when Response construction rejects its status", async () => {
    const h = streamRuntime();
    const response = await h.owner.response(async () => ({ ...h.descriptor, status: 204 }));
    expect(response.status).toBe(500);
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("rejects a producer without a cleanup method before any read", async () => {
    const h = streamRuntime();
    const descriptor: WorkspaceStreamDescriptor = { ...h.descriptor, iterator: { next: h.next } };
    const response = await h.owner.response(async () => descriptor);
    expect(response.status).toBe(500);
    expect(h.next).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("releases and reports safely if reading the cleanup method itself throws", async () => {
    const h = streamRuntime();
    const iterator = Object.defineProperty({ next: h.next }, "return", { get: () => { throw new Error("private producer accessor path"); } });
    const response = await h.owner.response(async () => ({ ...h.descriptor, iterator }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "The stream could not be prepared." });
    expect(h.next).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.observer).toHaveBeenCalledOnce();
    expect(h.observer).toHaveBeenCalledWith("workspace_stream.cleanup_failed");
  });

  it("retires the producer if current authority is lost before handoff", async () => {
    const h = streamRuntime();
    const response = await h.owner.response(async () => {
      h.revalidate.mockResolvedValue({ ok: false, status: 401, error: "Authentication required" });
      return h.descriptor;
    });
    expect(response.status).toBe(401);
    expect(h.next).not.toHaveBeenCalled();
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("sanitizes an authority store failure before handoff as unavailable", async () => {
    const h = streamRuntime();
    h.revalidate.mockRejectedValue(new Error("private identity database"));
    const response = await h.owner.response(h.prepare);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "Request authority could not be verified." });
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("drops a chunk when authority changes inside its producer read", async () => {
    const h = streamRuntime();
    h.next.mockImplementationOnce(async () => {
      h.revalidate.mockResolvedValue({ ok: false, status: 403, error: "Permission denied" });
      return { done: false, value: "private row" };
    });
    const response = await h.owner.response(h.prepare);
    await expect(response.text()).rejects.toMatchObject({ code: "workspace_stream.authority_lost", message: "Stream authority could not be verified.", refusal: { status: 403 } });
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("checks fresh domain access before reading and drops refused chunks", async () => {
    const h = streamRuntime();
    const response = await h.owner.response(h.prepare);
    h.domain.mockResolvedValue({ ok: false, status: 404, error: "Run dataset was not found or is not available." });
    await expect(response.text()).rejects.toMatchObject({ code: "workspace_stream.authority_lost", refusal: { status: 404 } });
    expect(h.next).not.toHaveBeenCalled();
    expect(h.retire).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("preserves the safe read error if producer cleanup rejects too", async () => {
    const h = streamRuntime();
    h.next.mockRejectedValue(new Error("private row at C:/tenant/db.sqlite"));
    h.retire.mockRejectedValue(new Error("private cleanup credential"));
    const response = await h.owner.response(h.prepare);
    const error = await response.text().catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code: "workspace_stream.read_failed", message: "The stream could not be read.", cleanupFailureCode: "workspace_stream.cleanup_failed" });
    expect(JSON.stringify(error)).not.toMatch(/private|credential|sqlite/u);
    expect(h.observer).toHaveBeenCalledOnce();
    expect(h.observer).toHaveBeenCalledWith("workspace_stream.cleanup_failed");
    expect(h.release).toHaveBeenCalledOnce();
  });

  it.each(["cancel", "eof"])("surfaces sanitized cleanup failure after %s", async mode => {
    const h = streamRuntime();
    h.retire.mockRejectedValue(new Error("private cleanup path"));
    const response = await h.owner.response(h.prepare);
    const consuming = mode === "cancel" ? response.body!.cancel() : response.text();
    await expect(consuming).rejects.toMatchObject({ code: "workspace_stream.cleanup_failed", message: "The stream could not be closed." });
    expect(h.observer).toHaveBeenCalledOnce();
    expect(h.observer).toHaveBeenCalledWith("workspace_stream.cleanup_failed");
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("contains a throwing cleanup observer and still releases the lease", async () => {
    const h = streamRuntime();
    h.observer.mockImplementation(() => { throw new Error("private observer detail"); });
    h.retire.mockRejectedValue(new Error("private cleanup detail"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await h.owner.response(h.prepare);
      await expect(response.body!.cancel()).rejects.toMatchObject({ code: "workspace_stream.cleanup_failed" });
      expect(logged).toHaveBeenCalledOnce();
      expect(logged).toHaveBeenCalledWith("workspace_stream.cleanup_observer_failed");
      expect(h.release).toHaveBeenCalledOnce();
    } finally {
      logged.mockRestore();
    }
  });
});
