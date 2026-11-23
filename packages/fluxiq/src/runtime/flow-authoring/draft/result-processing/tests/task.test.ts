import { describe, expect, it } from "vitest";
import { readAutomationStudioFlowTaskProcessing } from "../task.ts";

describe("a new task's processing declaration, as the transport carries it", () => {
  it("reads null and { process: null } as the one action-only declaration", () => {
    expect(readAutomationStudioFlowTaskProcessing(null)).toBeNull();
    expect(readAutomationStudioFlowTaskProcessing({ process: null })).toBeNull();
  });

  it("keeps a data declaration's criteria, an empty declaration as missing, and refuses anything else", () => {
    const criteria = { process: { sort: [{ field: "due", order: "desc" }] } };
    const read = readAutomationStudioFlowTaskProcessing(criteria);
    expect(read).toEqual(criteria);
    expect(read).not.toBe(criteria);
    expect(readAutomationStudioFlowTaskProcessing({ process: {} })).toEqual({ process: {} });
    expect(readAutomationStudioFlowTaskProcessing({})).toEqual({});
    expect(readAutomationStudioFlowTaskProcessing({ process: {}, extra: 1 })).toBeUndefined();
    expect(readAutomationStudioFlowTaskProcessing([])).toBeUndefined();
    expect(readAutomationStudioFlowTaskProcessing({ process: undefined })).toBeUndefined();
  });
});
