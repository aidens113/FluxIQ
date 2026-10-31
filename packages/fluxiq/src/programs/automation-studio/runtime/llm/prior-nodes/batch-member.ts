import type { AutomationStudioLlmEvidenceLoopInput } from "../loop-configuration.ts";
import type { AutomationStudioLlmRerunProvenance, AutomationStudioLlmRerunRecord } from "../rerun-provenance/index.ts";

/** Private execution transport; public arguments remain the original model request. */
export function automationStudioLlmEvidenceBatchMember(provenance: AutomationStudioLlmRerunProvenance, record: AutomationStudioLlmRerunRecord, admitted: () => boolean) {
  let main: "unacted" | "unproven" | "receipt" = "unacted";
  let stopped = false;
  let result: unknown;
  let failure: unknown;
  let outcome: Awaited<ReturnType<AutomationStudioLlmRerunProvenance["execute"]>> | undefined;
  const executeTool: AutomationStudioLlmEvidenceLoopInput["executeTool"] = async (request) => {
    if (request.signal?.aborted || !admitted()) {
      stopped = true;
      throw new Error("Prior member no longer admitted.");
    }
    try { outcome = await provenance.execute(record, { callId: request.callId, ...(request.signal ? { signal: request.signal } : {}) }); }
    catch (error) {
      main = "unproven";
      stopped = true;
      failure = error;
      throw new Error("Prior member executor failed.");
    }
    main = outcome.main;
    if (outcome.kind === "unavailable") {
      stopped = true;
      throw new Error("Prior member authority unavailable.");
    }
    if (outcome.kind === "threw") {
      stopped = true;
      failure = outcome.error;
      throw new Error("Prior member executor failed.");
    }
    result = outcome.result;
    if (outcome.kind === "unproven" || main !== "receipt") stopped = true;
    return outcome.result;
  };
  return {
    executeTool,
    get main() { return main; },
    get dispatched() { return main === "receipt"; },
    get outcome() { return outcome; },
    get result() { return result; },
    get failure() { return failure; },
    get stopped() { return stopped; },
    stop() { stopped = true; }
  };
}
