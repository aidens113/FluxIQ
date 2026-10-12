import { describe, expect, it } from "vitest";
import type { ClientGatewayReportedActionResult } from "@fluxiq/contracts/client-gateway";
import { readClientGatewayActionResult } from "../action-result-reading.ts";

const unacted = { category: "action_failed", code: "web.transport.transient", retryable: true, effect: "unacted" } as const;
const ambiguous = { category: "ambiguous_or_unknown", code: "web.action.unknown", retryable: false, effect: "ambiguous" } as const;

function result(fields: Partial<ClientGatewayReportedActionResult>): ClientGatewayReportedActionResult {
  return { commandId: "command.1", status: "succeeded", ...fields };
}

describe("reading a client's action result", () => {
  it("reads `interrupted` on a committing act as `unknown`, its outcome uncertain", () => {
    const reading = readClientGatewayActionResult(result({ status: "interrupted", failure: ambiguous }));
    expect(reading).toMatchObject({ reportedStatus: "interrupted", interrupted: true, effect: "ambiguous", result: { status: "unknown", failure: ambiguous } });
  });

  it("reads `interrupted` on an act the domain says did nothing as `failed`", () => {
    const reading = readClientGatewayActionResult(result({ status: "interrupted", failure: unacted }));
    expect(reading).toMatchObject({ reportedStatus: "interrupted", interrupted: true, effect: "unacted", result: { status: "failed", failure: unacted } });
  });

  it("holds `interrupted` uncertain when nothing says the act did nothing: a missing answer is never `not landed`", () => {
    expect(readClientGatewayActionResult(result({ status: "interrupted" }))).toMatchObject({ interrupted: true, effect: "ambiguous", result: { status: "unknown" } });
    const unparsed = readClientGatewayActionResult(result({ status: "interrupted", failure: { effect: "unacted" } as unknown as NonNullable<ClientGatewayReportedActionResult["failure"]> }));
    expect(unparsed.result.status).toBe("unknown");
  });

  it("still accepts today's wire statuses with the payload marker, unchanged, and knows them as interrupted", () => {
    const committing = result({ status: "unknown", failure: ambiguous, payload: { status: "interrupted", effect: "unknown" } });
    const other = result({ status: "failed", failure: unacted, payload: { status: "interrupted", effect: "unknown" } });
    expect(readClientGatewayActionResult(committing)).toMatchObject({ reportedStatus: "unknown", interrupted: true, effect: "ambiguous" });
    expect(readClientGatewayActionResult(committing).result).toBe(committing);
    expect(readClientGatewayActionResult(other)).toMatchObject({ reportedStatus: "failed", interrupted: true, effect: "unacted" });
    expect(readClientGatewayActionResult(other).result).toBe(other);
  });

  it("leaves an ordinary result as it came", () => {
    const succeeded = result({ payload: { status: "done" } });
    const reading = readClientGatewayActionResult(succeeded);
    expect(reading).toEqual({ result: succeeded, reportedStatus: "succeeded", interrupted: false });
    expect(reading.result).toBe(succeeded);
  });
});
