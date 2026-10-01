/** Serialize audit data without leaving a worker or object URL behind. */
export async function runtimeAuditBlob(audit: unknown, signal?: AbortSignal): Promise<Blob> {
  const aborted = () => new Error("Audit serialization cancelled.");
  if (signal?.aborted) throw aborted();
  if (typeof Worker === "undefined" || typeof URL === "undefined") {
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
    if (signal?.aborted) throw aborted();
    return blob;
  }
  const source = "self.onmessage=function(event){self.postMessage(new Blob([JSON.stringify(event.data,null,2)],{type:'application/json'}));};";
  const workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  let worker: Worker | undefined;
  let cancel: (() => void) | undefined;
  try {
    return await new Promise<Blob>((resolve, reject) => {
      worker = new Worker(workerUrl);
      cancel = () => reject(aborted());
      signal?.addEventListener("abort", cancel, { once: true });
      worker.onmessage = (event) => event.data instanceof Blob ? resolve(event.data) : reject(new Error("Audit serialization failed."));
      worker.onerror = () => reject(new Error("Audit serialization failed."));
      worker.onmessageerror = () => reject(new Error("Audit serialization failed."));
      if (signal?.aborted) cancel();
      else worker.postMessage(audit);
    });
  } finally {
    if (cancel) signal?.removeEventListener("abort", cancel);
    try { worker?.terminate(); } finally { URL.revokeObjectURL(workerUrl); }
  }
}
