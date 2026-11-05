// A lending library as a site: what its controls are called can change, a row can be busy, a look can
// fail, and a by-hand read shows a row in full, with a shelfmark and a handle a record output then
// drops. It sits over `./later-attempts.ts`, at both of its doors: the by-hand one (`./fake-library.ts`)
// and the engine's (`./fake-library-engine.ts`). A lending library is none of the Lab's realistic scenarios.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import type { LibraryNodeOver, LibraryTarget } from "./fake-library-engine.ts";
import { READ_LOANS, RENEW_CARD, RENEW_LOAN, runNode, toolCall, type FakeLibrary, type FakeLibraryFault } from "./fake-library.ts";
import { laterAttempts, type LaterAttemptsRestart } from "./later-attempts.ts";

export const TITLES = ["Atlas of Rivers", "Birds of the Coast", "Clockmaking", "Dune Walks"] as const;
export const [ATLAS, BIRDS, CLOCKS, DUNES] = TITLES;
export const RENEW = "Renew";
export const ON_THE_CARD = "Renew card";

const LOOK_TOOL_ID = "library.look";
const NO_SUCH_CONTROL = "library.no_such_control";
const LOCATION = { from: { location: "library://account" } };

export type Lane = Awaited<ReturnType<typeof laterAttempts>>;
/** What the domain says of a call before it is sent (`binding.describeCall`). */
export type LibrarySays = (call: { toolId: string; value: JsonObject }) => { target?: string; wouldRunWith?: JsonObject } | undefined;

/** The target's own side of things: what its controls are called now, and what it will not do at the moment. */
export type LibrarySite = {
  loanControl: string;
  cardControl: string;
  /** Rows a by-hand or forward press is refused on, as nothing done. */
  busy: Set<string>;
  /** How many reads showed rows by hand, for the handles they mint. */
  reads: number;
  /** Handle to row, of every row a by-hand read printed. */
  handles: Map<string, string>;
  /** A look fails, as a page that will not answer does. */
  blind: boolean;
  /** What the domain says of a call before it is sent; absent, it says nothing. */
  says?: LibrarySays;
};

const execution = (evidence: JsonObject, over: Partial<AutomationStudioLlmEvidenceToolExecutionResult> = {}): AutomationStudioLlmEvidenceToolExecutionResult => ({ kind: "llm_evidence_tool_execution", evidence, effectApplied: false, ...over });

const notThere = (replaying: boolean, code: string): AutomationStudioLlmEvidenceToolExecutionResult => execution(
  { ok: false, code },
  { ...(replaying ? { resultCode: "core.replay.failed" } : {}), failure: { category: "target_not_found", code, retryable: false, stage: "target_resolution", effect: "unacted" } }
);

/** A step written and not run: checked, frozen and nothing done, as a host answers `write`. */
function written(value: JsonObject, parameters: JsonObject): AutomationStudioLlmEvidenceToolExecutionResult {
  const { write: _not, ...call } = value;
  const ran = { node: String(value.node), parameters, consequences: value.consequences ?? [] };
  return execution({ ok: true, written: true }, { resultCode: "core.run_node.written", draft: { actionId: String(value.node), input: call, ranWith: ran, effect: "mutate", proposes: true, written: true, replay: LOCATION } });
}

function fullRows(site: LibrarySite, library: FakeLibrary): JsonObject[] {
  site.reads += 1;
  return library.loans.map((loan, index) => {
    const handle = `hand-${site.reads}-${index}`;
    site.handles.set(handle, loan.title);
    return { title: loan.title, due: loan.due, shelfmark: `Shelf ${index + 1}`, $handle: handle };
  });
}

function readByHand(site: LibrarySite, library: FakeLibrary, value: JsonObject, parameters: JsonObject, replaying: boolean): AutomationStudioLlmEvidenceToolExecutionResult {
  const rows = fullRows(site, library);
  const renewed = Object.values(library.renewals).reduce((sum, times) => sum + times, 0);
  return execution({ read: { extracted: rows }, page: { heading: "Your account", shelf: library.shelf, renewed } }, {
    effectApplied: true, outputs: { records: rows },
    draft: { actionId: READ_LOANS, input: value, ranWith: { node: READ_LOANS, parameters, consequences: [] }, replay: LOCATION, proposes: true, effect: "observe" },
    ...(replaying ? { resultCode: "core.replay.replayed" } : {})
  });
}

/** What the by-hand door does beyond the fake's own answers (`./fake-library.ts`): see the header. */
function siteFault(site: LibrarySite): FakeLibraryFault {
  return ({ toolId, value }, library) => {
    if (toolId === LOOK_TOOL_ID) return site.blind ? execution({ ok: false, code: "library.page_silent" }, { failure: { category: "action_failed", code: "library.page_silent", retryable: false, stage: "dispatch", effect: "unacted" } }) : undefined;
    if (value.replay === "verify" || value.replay === "reset") return undefined;
    const replaying = value.replay === "step";
    const parameters = (value.parameters ?? {}) as JsonObject;
    if (value.write === true) return written(value, parameters);
    if (value.node === READ_LOANS) return readByHand(site, library, value, parameters, replaying);
    if (value.node === RENEW_CARD && parameters.control !== undefined && parameters.control !== site.cardControl) return notThere(replaying, NO_SUCH_CONTROL);
    if (value.node !== RENEW_LOAN) return undefined;
    if (parameters.control !== undefined && parameters.control !== site.loanControl) return notThere(replaying, NO_SUCH_CONTROL);
    const subject = String((value.item as JsonObject | undefined)?.title ?? parameters.title ?? "");
    if (site.busy.has(subject)) return notThere(replaying, "library.row_busy");
    const handle = ((parameters.target as JsonObject | undefined)?.handle) as string | undefined;
    if (handle === undefined) return undefined;
    // A press by a handle is on that handle's row.
    const title = site.handles.get(handle) ?? handle;
    library.renewals[title] = (library.renewals[title] ?? 0) + 1;
    const ran = { node: RENEW_LOAN, parameters, consequences: value.consequences ?? [] };
    return execution({ ok: true, actedOn: title, pageChanged: true }, { effectApplied: true, draft: { actionId: RENEW_LOAN, input: value, ranWith: ran, replay: LOCATION, proposes: true, effect: "mutate" } });
  };
}

/** The same site at the engine's door: an old name finds nothing, and the rest is up to `then`. */
function siteOver(site: LibrarySite, then?: LibraryNodeOver): LibraryNodeOver {
  return (request) => {
    const control = request.parameters?.control;
    const wanted = request.nodeId === RENEW_LOAN ? site.loanControl : request.nodeId === RENEW_CARD ? site.cardControl : undefined;
    if (wanted !== undefined && control !== undefined && control !== wanted) return { status: "failed", route: "failed", message: "Page says: nothing here on Elm Street 4", failure: { category: "target_not_found", code: NO_SUCH_CONTROL, retryable: false, stage: "target_resolution", effect: "unacted" } };
    return then?.(request);
  };
}

/** One lane over the site, whose engine door knows it too. `over` sets what a node answers beyond that. */
export async function siteLane(cleanups: (() => Promise<void>)[], given: { titles?: readonly string[]; site?: LibrarySite; restart?: LaterAttemptsRestart } = {}): Promise<{ lane: Lane; site: LibrarySite; target: LibraryTarget; over: (then?: LibraryNodeOver) => void }> {
  const site: LibrarySite = given.site ?? { loanControl: RENEW, cardControl: ON_THE_CARD, busy: new Set(), reads: 0, handles: new Map(), blind: false };
  const lane = await laterAttempts(cleanups, { titles: given.titles ?? TITLES, fault: siteFault(site), describe: (call) => site.says?.(call), ...(given.restart ? { restart: given.restart } : {}) });
  const over = (then?: LibraryNodeOver) => { lane.target.over = siteOver(site, then); };
  over();
  return { lane, site, target: lane.target, over };
}

export const pressLoanByHand = (callId: string, title: string, control = RENEW, over: JsonObject = { add: true }): JsonObject => runNode(callId, RENEW_LOAN, { title, control }, ["modify_existing"], over);
export const pressCardByHand = (callId = "card", control = ON_THE_CARD, over: JsonObject = { add: true }): JsonObject => runNode(callId, RENEW_CARD, { control }, ["modify_existing"], over);
export const forwardFrom = (from: number, callId = "forward"): JsonObject => toolCall(callId, "core.run_flow", { from });
/** The step written again and not run: the repair of one whose control was renamed, since a rerun of a saved lasting step only checks (`runtime/llm/node-tools/rerun-check.ts`). */
export const writeStep = (node: string, parameters: JsonObject, callId = "fix"): JsonObject => toolCall(callId, "core.run_node", { node, parameters, consequences: ["modify_existing"], write: true });
