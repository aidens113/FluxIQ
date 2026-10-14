import { NextResponse } from "next/server";

/**
 * A program endpoint's answer as an HTTP response, or a 500 that says why it
 * could not be one.
 *
 * `NextResponse.json` writes the body with `JSON.stringify`, which throws on a
 * value it cannot write: a string past V8's limit (`RangeError: Invalid string
 * length`), a cycle, a BigInt. Thrown from the route, that reached Next.js as
 * an unexplained failure with an empty body. An A8 build's
 * `list-runtime-sessions` answer did exactly that once a project's sessions
 * outgrew one string (`run-mv8mf0x5-95071c06`, t604). The handler is the place
 * to keep an answer bounded; this is the guard for one that was not, so the
 * caller is told what happened and the server goes on to the next request.
 */
export function programJsonResponse(programId: string, endpoint: string, body: unknown, status: number): NextResponse {
  try {
    return NextResponse.json(body, { status });
  } catch (error) {
    const tooLarge = error instanceof RangeError;
    console.error(`[FluxIQ] ${programId}/${endpoint} answered with a body that could not be sent as JSON:`, error);
    return NextResponse.json({
      ok: false,
      error: tooLarge
        ? `FluxIQ's answer to ${endpoint} was too large to send as one response. Ask for less of it (a smaller page, a narrower filter, or one item by id).`
        : `FluxIQ's answer to ${endpoint} could not be written as JSON.`,
      errorCode: tooLarge ? "response.too_large" : "response.unserializable",
    }, { status: 500 });
  }
}
